import path from 'node:path';
import { loadTools, getTool, getAssetDestination, supportsAsset } from '../lib/tools.js';
import { removePath, pathExists } from '../lib/fs-ops.js';
import {
  read as readLockfile,
  write as writeLockfile,
  removeAsset,
  LOCKFILE_NAME,
} from '../lib/lockfile.js';
import { removeSidecar } from '../lib/sidecar.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function remove(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const target = opts.target;
  if (!target) throw new Error('remove: missing target');

  let lockfile = readLockfile(target);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(target, LOCKFILE_NAME)}; nothing to remove (not installed).`);
  }

  const tools = loadTools(path.join(sourceRoot, 'config'));
  const tool = getTool(tools, lockfile.tool);

  let toRemove = {};
  if (opts.all) {
    for (const type of ASSET_TYPES) {
      const tracked = (lockfile.assets && lockfile.assets[type]) || {};
      toRemove[type] = Object.keys(tracked);
    }
  } else {
    for (const type of ASSET_TYPES) {
      toRemove[type] = Array.isArray(opts[type]) ? [...opts[type]] : [];
    }
  }

  const result = { removed: [], notFound: [] };

  for (const type of ASSET_TYPES) {
    if (!toRemove[type] || toRemove[type].length === 0) continue;
    if (!supportsAsset(tool, type)) {
      logger.warn(`Tool ${tool.displayName} does not support ${type}; nothing to remove.`);
      continue;
    }
    for (const name of toRemove[type]) {
      const tracked = lockfile.assets && lockfile.assets[type] && lockfile.assets[type][name];
      if (!tracked) {
        logger.warn(`${type}/${name}: not installed (skip)`);
        result.notFound.push({ type, name });
        continue;
      }
      const dest = getAssetDestination(tool, target, type, name);
      const sidecarSpec = tool.assetFormats[type]?.sidecar;
      if (opts.dryRun) {
        logger.dryRun(`remove ${type}/${name} at ${dest}`);
        if (sidecarSpec) logger.dryRun(`remove sidecar for ${type}/${name}`);
      } else {
        if (pathExists(dest)) removePath(dest);
        if (sidecarSpec) {
          removeSidecar({ destPath: dest, sidecarSpec, assetName: name });
        }
        lockfile = removeAsset(lockfile, type, name);
        logger.success(`removed ${type}/${name}`);
      }
      result.removed.push({ type, name });
    }
  }

  if (!opts.dryRun) {
    lockfile.lastUpdatedAt = new Date().toISOString();
    writeLockfile(target, lockfile);
  }

  return result;
}

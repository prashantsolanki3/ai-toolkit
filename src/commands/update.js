import path from 'node:path';
import { loadTools, getTool, getAssetDestination, supportsAsset } from '../lib/tools.js';
import { hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { resolveSourcePath, copyAssetAdaptive } from '../lib/source-adapter.js';
import { read as readLockfile, write as writeLockfile, LOCKFILE_NAME } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function update(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const target = opts.target;
  if (!target) throw new Error('update: missing target');

  const lockfile = readLockfile(target);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(target, LOCKFILE_NAME)}; nothing to update (not installed).`);
  }

  const tools = loadTools(path.join(sourceRoot, 'config'));
  const tool = getTool(tools, lockfile.tool);

  const result = { updated: [], skipped: [], missing: [], unchanged: [] };

  for (const type of ASSET_TYPES) {
    if (!supportsAsset(tool, type)) continue;
    const tracked = (lockfile.assets && lockfile.assets[type]) || {};
    for (const name of Object.keys(tracked)) {
      const destFormat = tool.assetFormats[type];

      let source;
      try {
        source = resolveSourcePath({ sourceRoot, assetType: type, name, destFormat });
      } catch {
        logger.warn(`${type}/${name}: removed upstream — leaving in place, untrack via 'remove'`);
        result.missing.push({ type, name });
        continue;
      }

      const dest = getAssetDestination(tool, target, type, name);
      const sourceSha =
        source.kind === 'directory' ? hashDir(source.path) : hashFile(source.path);
      const lockSha = tracked[name].sha;
      const installedSha = pathExists(dest)
        ? destFormat.type === 'directory'
          ? hashDir(dest)
          : hashFile(dest)
        : null;

      if (sourceSha === lockSha && installedSha === lockSha) {
        result.unchanged.push({ type, name });
        continue;
      }

      if (sourceSha === lockSha && installedSha !== lockSha) {
        result.skipped.push({ type, name, reason: 'local edits and no upstream change' });
        logger.warn(`${type}/${name}: locally edited; nothing new upstream — leaving as-is`);
        continue;
      }

      const hasLocalEdits = installedSha !== null && installedSha !== lockSha;
      if (hasLocalEdits && !opts.force) {
        logger.warn(`${type}/${name}: local edits detected — skipping. Re-run with --force to overwrite.`);
        result.skipped.push({ type, name, reason: 'local edits; use --force to overwrite' });
        continue;
      }

      if (opts.dryRun) {
        logger.dryRun(`update ${type}/${name}`);
        result.updated.push({ type, name });
        continue;
      }

      copyAssetAdaptive({
        sourcePath: source.path,
        sourceKind: source.kind,
        destPath: dest,
        destFormat,
      });
      const newSha = destFormat.type === 'directory' ? hashDir(dest) : hashFile(dest);
      lockfile.assets[type][name] = {
        ...tracked[name],
        sha: newSha,
        installedAt: new Date().toISOString(),
      };
      result.updated.push({ type, name });
      logger.success(`updated ${type}/${name}`);
    }
  }

  if (!opts.dryRun) {
    lockfile.lastUpdatedAt = new Date().toISOString();
    writeLockfile(target, lockfile);
  }

  return result;
}

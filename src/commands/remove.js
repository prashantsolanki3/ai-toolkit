import path from 'node:path';
import {
  loadTools,
  getTool,
  getAssetDestination,
  resolveTargetPath,
  supportsAsset,
  findInstalledTools,
} from '../lib/tools.js';
import { loadManifest, resolvePreset } from '../lib/manifest.js';
import { removePath, pathExists, cleanupEmptyDirs } from '../lib/fs-ops.js';
import {
  read as readLockfile,
  write as writeLockfile,
  removeAsset,
  LOCKFILE_NAME,
} from '../lib/lockfile.js';
import { removeSidecar } from '../lib/sidecar.js';
import { removeMcpEntryForCommand } from '../lib/mcp.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];

export async function remove(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));

  // When --all is passed and no --tool specified, remove from all installed tools.
  // Sibling tools that share a workspace dir (vscode-copilot + copilot-cli at
  // .github/, kiro + kiro-cli at .kiro/) come back as separate entries from
  // findInstalledTools; dedupe by directory so we only tear each one down once.
  if (opts.all && !opts.tool) {
    const found = findInstalledTools(tools, projectRoot);
    if (found.length === 0) {
      throw new Error(
        `No installed tools found under ${projectRoot}. Pass --tool <name> or --target <project-root>.`,
      );
    }
    const seenDirs = new Set();
    const results = [];
    for (const toolInfo of found) {
      if (seenDirs.has(toolInfo.dir)) continue;
      seenDirs.add(toolInfo.dir);
      const result = await removeFromTool(toolInfo.dir, tools, sourceRoot, projectRoot, opts, logger);
      results.push(result);
    }
    return { removed: results.flatMap((r) => r.removed), notFound: results.flatMap((r) => r.notFound) };
  }

  const target = resolveRemoveTarget({ tools, projectRoot, toolName: opts.tool });
  return removeFromTool(target, tools, sourceRoot, projectRoot, opts, logger);
}

async function removeFromTool(target, tools, sourceRoot, projectRoot, opts, logger) {
  let lockfile = readLockfile(target);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(target, LOCKFILE_NAME)}; nothing to remove (not installed).`);
  }

  const tool = getTool(tools, lockfile.tool);

  let toRemove = Object.fromEntries(ASSET_TYPES.map((t) => [t, []]));

  if (opts.all) {
    for (const type of ASSET_TYPES) {
      const tracked = (lockfile.assets && lockfile.assets[type]) || {};
      toRemove[type] = Object.keys(tracked);
    }
  } else {
    if (opts.preset) {
      const manifest = loadManifest(sourceRoot);
      const preset = resolvePreset(manifest, opts.preset);
      for (const type of ASSET_TYPES) {
        for (const name of preset[type] || []) toRemove[type].push(name);
      }
    }
    for (const type of ASSET_TYPES) {
      if (Array.isArray(opts[type])) toRemove[type].push(...opts[type]);
    }
    // Deduplicate after preset + explicit union.
    for (const type of ASSET_TYPES) {
      toRemove[type] = Array.from(new Set(toRemove[type]));
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

      if (type === 'mcp') {
        const r = removeMcpEntryForCommand({
          tool,
          scope: lockfile.scope || 'workspace',
          projectRoot,
          name,
          trackedEntry: tracked,
          dryRun: opts.dryRun,
          logger,
        });
        if (r.status === 'removed') {
          if (!opts.dryRun) lockfile = removeAsset(lockfile, 'mcp', name);
          result.removed.push({ type, name });
        }
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
    
    // Check if all assets have been removed
    const hasAnyAssets = ASSET_TYPES.some(type => 
      lockfile.assets && lockfile.assets[type] && Object.keys(lockfile.assets[type]).length > 0
    );
    
    if (!hasAnyAssets) {
      // All assets removed, delete the lockfile
      const lockfilePath = path.join(target, LOCKFILE_NAME);
      if (pathExists(lockfilePath)) {
        removePath(lockfilePath);
        logger.success(`removed ${LOCKFILE_NAME}`);
      }
      
      // Clean up empty directories starting from tool root, stopping at project root
      cleanupEmptyDirs(target, projectRoot);
    } else {
      // Still have assets, just update the lockfile
      writeLockfile(target, lockfile);
    }
  }

  return result;
}

function resolveRemoveTarget({ tools, projectRoot, toolName }) {
  if (toolName) {
    const tool = getTool(tools, toolName);
    return resolveTargetPath(tool, 'workspace', projectRoot);
  }
  const found = findInstalledTools(tools, projectRoot);
  if (found.length === 0) {
    throw new Error(
      `No installed tools found under ${projectRoot}. Pass --tool <name> or --target <project-root>.`,
    );
  }
  if (found.length > 1) {
    const names = found.map((f) => f.tool).join(', ');
    throw new Error(
      `Multiple installed tools found under ${projectRoot} (${names}). Pass --tool <name> to disambiguate.`,
    );
  }
  return found[0].dir;
}

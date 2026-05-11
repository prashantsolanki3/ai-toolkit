import path from 'node:path';
import {
  loadTools,
  getTool,
  getAssetDestination,
  resolveTargetPath,
  supportsAsset,
  findInstalledTools,
} from '../lib/tools.js';
import { hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { resolveSourcePath, copyAssetAdaptive } from '../lib/source-adapter.js';
import { read as readLockfile, write as writeLockfile, LOCKFILE_NAME } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function update(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));

  const target = resolveUpdateTarget({ tools, projectRoot, toolName: opts.tool });

  const lockfile = readLockfile(target);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(target, LOCKFILE_NAME)}; nothing to update (not installed).`);
  }

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
      const currentSourceSha =
        source.kind === 'directory' ? hashDir(source.path) : hashFile(source.path);
      const trackedSourceSha = tracked[name].sourceSha || tracked[name].sha;
      const currentDestSha = pathExists(dest)
        ? destFormat.type === 'directory'
          ? hashDir(dest)
          : hashFile(dest)
        : null;
      const trackedDestSha = tracked[name].destSha || tracked[name].sha;

      const sourceChanged = currentSourceSha !== trackedSourceSha;
      const destEdited = currentDestSha !== null && currentDestSha !== trackedDestSha;

      if (!sourceChanged && !destEdited) {
        result.unchanged.push({ type, name });
        continue;
      }

      if (!sourceChanged && destEdited) {
        result.skipped.push({ type, name, reason: 'local edits and no upstream change' });
        logger.warn(`${type}/${name}: locally edited; nothing new upstream — leaving as-is`);
        continue;
      }

      if (destEdited && !opts.force) {
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
        toolName: lockfile.tool,
      });
      const newSourceSha = currentSourceSha;
      const newDestSha = destFormat.type === 'directory' ? hashDir(dest) : hashFile(dest);
      lockfile.assets[type][name] = {
        ...tracked[name],
        sourceSha: newSourceSha,
        destSha: newDestSha,
        sha: newDestSha,
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

function resolveUpdateTarget({ tools, projectRoot, toolName }) {
  if (toolName) {
    const tool = getTool(tools, toolName);
    return resolveTargetPath(tool, 'workspace', projectRoot);
  }
  const found = findInstalledTools(tools, projectRoot);
  if (found.length === 0) {
    throw new Error(
      `No installed tools found under ${projectRoot}. Run \`ai-toolkit install --tool <name>\` first, or pass --target.`,
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

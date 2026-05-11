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
import { hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { resolveSourcePath, copyAssetAdaptive } from '../lib/source-adapter.js';
import { read as readLockfile, write as writeLockfile, LOCKFILE_NAME } from '../lib/lockfile.js';
import { updateMcpEntry } from '../lib/mcp.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];

export async function update(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));

  // --scope is honoured here the same way it is by install: default
  // "workspace" with explicit "global" as the only other value. The lockfile
  // also records its own scope; we fall back to that when the caller didn't
  // pass --scope, so the common case (update what you installed) just works.
  const requestedScope = opts.scope || null;
  const result = { updated: [], skipped: [], missing: [], unchanged: [] };

  let target;
  try {
    target = resolveUpdateTarget({
      tools,
      projectRoot,
      toolName: opts.tool,
      scope: requestedScope || 'workspace',
    });
  } catch (err) {
    // If the user explicitly asked for a scope this tool doesn't support
    // (most commonly --scope global on a workspace-only tool like vscode-
    // copilot or kiro), treat that as a soft skip: warn, return empty,
    // don't throw. Matches install's multi-tool behaviour.
    if (requestedScope && /not support|scope/.test(err.message)) {
      logger.warn(`Skipping update for ${opts.tool || '(autodiscovered)'}: ${err.message}`);
      return result;
    }
    throw err;
  }

  const lockfile = readLockfile(target);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(target, LOCKFILE_NAME)}; nothing to update (not installed).`);
  }

  const tool = getTool(tools, lockfile.tool);
  const manifest = loadManifest(sourceRoot);

  const filter = buildAssetFilter(opts, lockfile, manifest, logger);
  const scope = requestedScope || lockfile.scope || 'workspace';

  for (const type of ASSET_TYPES) {
    if (!supportsAsset(tool, type)) continue;
    const tracked = (lockfile.assets && lockfile.assets[type]) || {};
    for (const name of Object.keys(tracked)) {
      if (!filter.includes(type, name)) continue;

      if (type === 'mcp') {
        const r = updateMcpEntry({
          tool,
          toolName: lockfile.tool,
          scope,
          projectRoot,
          name,
          manifest,
          sourceRoot,
          trackedEntry: tracked[name],
          force: opts.force,
          dryRun: opts.dryRun,
          logger,
        });
        if (r.status === 'updated') {
          if (r.lockfileEntry) lockfile.assets.mcp[name] = r.lockfileEntry;
          result.updated.push({ type, name });
        } else if (r.status === 'unchanged') {
          result.unchanged.push({ type, name });
        } else if (r.status === 'skipped-edited' || r.status === 'skipped-scope') {
          result.skipped.push({ type, name, reason: r.reason });
        } else if (r.status === 'missing') {
          result.missing.push({ type, name });
        }
        continue;
      }

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

// Filter the set of assets the update command will iterate.
//
// - No --preset and no per-type lists  => no filter (update everything tracked).
// - --preset <name>                    => union of preset's per-type lists.
// - --skills a,b / --agents c / ...    => union with the above.
//
// Any explicitly-named asset that isn't actually tracked in the lockfile
// surfaces a warning so the user knows the filter excluded everything.
function buildAssetFilter(opts, lockfile, manifest, logger) {
  const hasPreset = Boolean(opts.preset);
  const hasExplicit = ASSET_TYPES.some(
    (t) => Array.isArray(opts[t]) && opts[t].length > 0,
  );
  if (!hasPreset && !hasExplicit) {
    return { includes: () => true };
  }

  const allowed = Object.fromEntries(ASSET_TYPES.map((t) => [t, new Set()]));

  if (hasPreset) {
    const preset = resolvePreset(manifest, opts.preset);
    for (const t of ASSET_TYPES) {
      for (const name of preset[t] || []) allowed[t].add(name);
    }
  }
  for (const t of ASSET_TYPES) {
    if (Array.isArray(opts[t])) {
      for (const name of opts[t]) allowed[t].add(name);
    }
  }

  // Warn about names that won't match anything tracked.
  for (const t of ASSET_TYPES) {
    if (!Array.isArray(opts[t])) continue;
    const tracked = lockfile.assets?.[t] || {};
    for (const name of opts[t]) {
      if (!(name in tracked)) {
        logger.warn(`${t}/${name}: not tracked in the lockfile — skipping.`);
      }
    }
  }

  return {
    includes: (type, name) => allowed[type]?.has(name),
  };
}

function resolveUpdateTarget({ tools, projectRoot, toolName, scope = 'workspace' }) {
  if (toolName) {
    const tool = getTool(tools, toolName);
    return resolveTargetPath(tool, scope, projectRoot);
  }
  // Autodiscovery only scans workspace subdirs for lockfiles. --scope global
  // without --tool would need a different discovery story (which global dir
  // to look in?), so we require --tool in that case.
  if (scope === 'global') {
    throw new Error(`--scope global requires --tool <name> (no autodiscovery for global scope).`);
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

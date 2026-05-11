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

// Same rule as install: workspace lockfile lives at projectRoot, global at
// the tool's own global dir.
function lockfileLocation({ scope, projectRoot, toolTarget }) {
  return scope === 'global' ? toolTarget : projectRoot;
}

export async function update(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));

  // --scope is honoured here the same way it is by install: default
  // "workspace" with explicit "global" as the only other value. The lockfile
  // also records its own scope per tool entry; we fall back to that when
  // the caller didn't pass --scope.
  const requestedScope = opts.scope || null;
  const aggregate = { updated: [], skipped: [], missing: [], unchanged: [] };

  // Read the unified lockfile once. For workspace scope that's projectRoot;
  // for global scope the user must pass --tool so we know which global dir
  // to look in.
  const scopeForLookup = requestedScope || 'workspace';
  if (scopeForLookup === 'global' && !opts.tool) {
    throw new Error(`--scope global requires --tool <name> (no autodiscovery for global scope).`);
  }

  // Pick the tool(s) to update.
  let toolNames;
  if (opts.tool) {
    toolNames = [opts.tool];
  } else {
    const found = findInstalledTools(tools, projectRoot);
    if (found.length === 0) {
      throw new Error(
        `No installed tools found under ${projectRoot}. Run \`ai-toolkit install --tool <name>\` first, or pass --target.`,
      );
    }
    toolNames = found.map((f) => f.tool);
  }

  for (const toolName of toolNames) {
    let result;
    try {
      result = await updateOne({
        toolName,
        opts,
        tools,
        sourceRoot,
        projectRoot,
        requestedScope,
        logger,
      });
    } catch (err) {
      // Soft-skip scope mismatches the same way installAll does. Anything else propagates.
      if (requestedScope && /not support|scope/.test(err.message)) {
        logger.warn(`Skipping update for ${toolName}: ${err.message}`);
        continue;
      }
      throw err;
    }
    aggregate.updated.push(...result.updated);
    aggregate.skipped.push(...result.skipped);
    aggregate.missing.push(...result.missing);
    aggregate.unchanged.push(...result.unchanged);
  }
  return aggregate;
}

async function updateOne({ toolName, opts, tools, sourceRoot, projectRoot, requestedScope, logger }) {
  const tool = getTool(tools, toolName);
  const result = { updated: [], skipped: [], missing: [], unchanged: [] };

  const scopeForPath = requestedScope || 'workspace';
  // Resolving target path with the scope catches "this tool doesn't support
  // this scope" before we try to read a lockfile that won't exist.
  const target = resolveTargetPath(tool, scopeForPath, projectRoot);
  const lockDir = lockfileLocation({ scope: scopeForPath, projectRoot, toolTarget: target });

  const lockfile = readLockfile(lockDir);
  if (!lockfile) {
    throw new Error(`No lockfile at ${path.join(lockDir, LOCKFILE_NAME)}; nothing to update (not installed).`);
  }
  const toolSection = lockfile.tools?.[toolName];
  if (!toolSection) {
    throw new Error(`Lockfile at ${lockDir} does not track tool "${toolName}". Run install first.`);
  }
  const manifest = loadManifest(sourceRoot);

  const filter = buildAssetFilter(opts, toolSection, manifest, logger);
  // Trust the per-tool recorded scope when the caller didn't supply one.
  const scope = requestedScope || toolSection.scope || 'workspace';

  for (const type of ASSET_TYPES) {
    if (!supportsAsset(tool, type)) continue;
    const tracked = toolSection.assets?.[type] || {};
    for (const name of Object.keys(tracked)) {
      if (!filter.includes(type, name)) continue;

      if (type === 'mcp') {
        const r = updateMcpEntry({
          tool,
          toolName,
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
          if (r.lockfileEntry) toolSection.assets.mcp[name] = r.lockfileEntry;
          result.updated.push({ type, name, tool: toolName });
        } else if (r.status === 'unchanged') {
          result.unchanged.push({ type, name, tool: toolName });
        } else if (r.status === 'skipped-edited' || r.status === 'skipped-scope') {
          result.skipped.push({ type, name, tool: toolName, reason: r.reason });
        } else if (r.status === 'missing') {
          result.missing.push({ type, name, tool: toolName });
        }
        continue;
      }

      const destFormat = tool.assetFormats[type];

      let source;
      try {
        source = resolveSourcePath({ sourceRoot, assetType: type, name, destFormat });
      } catch {
        logger.warn(`${type}/${name}: removed upstream — leaving in place, untrack via 'remove'`);
        result.missing.push({ type, name, tool: toolName });
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
        result.unchanged.push({ type, name, tool: toolName });
        continue;
      }

      if (!sourceChanged && destEdited) {
        result.skipped.push({ type, name, tool: toolName, reason: 'local edits and no upstream change' });
        logger.warn(`${type}/${name}: locally edited; nothing new upstream — leaving as-is`);
        continue;
      }

      if (destEdited && !opts.force) {
        logger.warn(`${type}/${name}: local edits detected — skipping. Re-run with --force to overwrite.`);
        result.skipped.push({ type, name, tool: toolName, reason: 'local edits; use --force to overwrite' });
        continue;
      }

      if (opts.dryRun) {
        logger.dryRun(`update ${type}/${name}`);
        result.updated.push({ type, name, tool: toolName });
        continue;
      }

      copyAssetAdaptive({
        sourcePath: source.path,
        sourceKind: source.kind,
        destPath: dest,
        destFormat,
        toolName,
      });
      const newSourceSha = currentSourceSha;
      const newDestSha = destFormat.type === 'directory' ? hashDir(dest) : hashFile(dest);
      toolSection.assets[type][name] = {
        ...tracked[name],
        sourceSha: newSourceSha,
        destSha: newDestSha,
        sha: newDestSha,
        installedAt: new Date().toISOString(),
      };
      result.updated.push({ type, name, tool: toolName });
      logger.success(`updated ${type}/${name}`);
    }
  }

  if (!opts.dryRun) {
    lockfile.lastUpdatedAt = new Date().toISOString();
    writeLockfile(lockDir, lockfile);
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
function buildAssetFilter(opts, toolSection, manifest, logger) {
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
    const tracked = toolSection.assets?.[t] || {};
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

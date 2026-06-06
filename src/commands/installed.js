import path from 'node:path';
import {
  loadTools,
  getTool,
  resolveTargetPath,
  getAssetDestination,
} from '../lib/tools.js';
import { loadManifest, resolvePreset } from '../lib/manifest.js';
import { read as readLockfile, LOCKFILE_NAME } from '../lib/lockfile.js';
import { hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];

// File-copy asset types whose on-disk content we can drift-check by SHA. MCP
// is a JSON merge (no single dest file to hash here) so it's out of scope for
// the content drift-check.
const DRIFT_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

// Workspace lockfile lives at projectRoot; global lives in the tool's
// global target dir. Mirrors install/update/remove.
function lockfileLocation({ scope, projectRoot, toolTarget }) {
  return scope === 'global' ? toolTarget : projectRoot;
}

export async function installed(opts = {}) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));
  const scope = opts.scope || 'workspace';
  const filter = buildFilter(opts, sourceRoot);

  // --check: drift-detection mode. Recompute each tracked file-copy asset's
  // installed content SHA and compare to the lockfile's recorded destSha.
  // Returns { drift: [...] }; the CLI turns a non-empty drift into exit 1.
  if (opts.check) {
    return checkDrift({ logger, tools, projectRoot, scope, tool: opts.tool });
  }

  // Special case: --scope global --tool X looks at the tool's own
  // lockfile (per-tool dir). Otherwise we read the unified workspace
  // lockfile at projectRoot.
  if (opts.tool && scope === 'global') {
    const tool = getTool(tools, opts.tool);
    const toolTarget = resolveTargetPath(tool, 'global', projectRoot);
    const lockDir = lockfileLocation({ scope: 'global', projectRoot, toolTarget });
    const lockfile = readLockfile(lockDir);
    if (!lockfile) {
      logger.info(`Nothing installed at ${lockDir}/${LOCKFILE_NAME}.`);
      return;
    }
    reportLockfile({ logger, lockfile, lockDir, projectRoot, filter, toolNameFilter: opts.tool, tools });
    return;
  }

  // Workspace path: read the unified lockfile once, report per tool.
  const lockDir = projectRoot;
  const lockfile = readLockfile(lockDir);
  if (!lockfile) {
    logger.info(`Nothing installed in ${projectRoot}.`);
    logger.info(`Looked for ${path.join(projectRoot, LOCKFILE_NAME)}.`);
    return;
  }
  reportLockfile({
    logger,
    lockfile,
    lockDir,
    projectRoot,
    filter,
    toolNameFilter: opts.tool || null,
    tools,
  });
}

// Walk the project lockfile and report any installed file-copy asset whose
// on-disk content no longer matches the SHA the lockfile recorded at install
// time — i.e. the installed copy was edited/tampered (or vanished). This is
// the first-class, exit-code-bearing drift check (issue #15); `update
// --dry-run` only *warns* and conflates upstream changes with local edits.
//
// We compare installed content vs lockfile destSha. A missing dest is drift
// too. MCP entries are skipped (JSON merge, no single hashable dest file).
function checkDrift({ logger, tools, projectRoot, scope, tool: toolNameFilter }) {
  const drift = [];

  // Global-scope lockfiles live in the tool's own global dir, not the project
  // root — same special-case the report path uses. Require --tool so we know
  // which global dir to read.
  let lockDir = projectRoot;
  if (scope === 'global') {
    if (!toolNameFilter) {
      throw new Error(`installed --check --scope global requires --tool <name> (no autodiscovery for global scope).`);
    }
    const tool = getTool(tools, toolNameFilter);
    lockDir = resolveTargetPath(tool, 'global', projectRoot);
  }

  const lockfile = readLockfile(lockDir);
  if (!lockfile) {
    logger.info(`Nothing installed at ${path.join(lockDir, LOCKFILE_NAME)} — no drift to check.`);
    return { drift };
  }

  for (const [toolName, section] of Object.entries(lockfile.tools || {})) {
    if (toolNameFilter && toolName !== toolNameFilter) continue;
    if (section.scope && scope && section.scope !== scope) continue;
    const toolConfig = tools.tools?.[toolName];
    if (!toolConfig) continue;
    let target;
    try {
      target = resolveTargetPath(toolConfig, section.scope || 'workspace', projectRoot);
    } catch {
      continue;
    }
    drift.push(...driftForTool({ logger, toolName, section, toolConfig, target }));
  }

  if (drift.length === 0) {
    logger.info('No drift — every tracked asset matches its lockfile sha.');
  } else {
    logger.error(`${drift.length} asset(s) drifted from the lockfile.`);
  }
  return { drift };
}

// Drift entries for a single tool: one per tracked file-copy asset whose
// installed content no longer matches the lockfile destSha (or is missing).
function driftForTool({ logger, toolName, section, toolConfig, target }) {
  const out = [];
  for (const type of DRIFT_TYPES) {
    const tracked = section.assets?.[type] || {};
    const format = toolConfig.assetFormats?.[type];
    if (!format) continue;
    for (const [name, entry] of Object.entries(tracked)) {
      const dest = getAssetDestination(toolConfig, target, type, name);
      if (!pathExists(dest)) {
        out.push({ tool: toolName, type, name, reason: 'installed asset missing' });
        logger.warn(`DRIFT ${toolName} ${type}/${name}: installed asset missing at ${dest}`);
        continue;
      }
      const trackedDestSha = entry.destSha || entry.sha;
      const currentSha = format.type === 'directory' ? hashDir(dest) : hashFile(dest);
      if (trackedDestSha && currentSha !== trackedDestSha) {
        out.push({ tool: toolName, type, name, reason: 'installed content drifted from lockfile' });
        logger.warn(`DRIFT ${toolName} ${type}/${name}: installed content differs from lockfile sha`);
      }
    }
  }
  return out;
}

function buildFilter(opts, sourceRoot) {
  const types = opts.type ? new Set([opts.type]) : null;
  let presetAllowlist = null;
  if (opts.preset) {
    const manifest = loadManifest(sourceRoot);
    const preset = resolvePreset(manifest, opts.preset);
    presetAllowlist = Object.fromEntries(ASSET_TYPES.map((t) => [t, new Set(preset[t] || [])]));
  }
  return {
    includesType: (t) => (types ? types.has(t) : true),
    includesAsset: (t, name) => (presetAllowlist ? presetAllowlist[t]?.has(name) : true),
  };
}

function reportLockfile({ logger, lockfile, lockDir, projectRoot, filter, toolNameFilter, tools }) {
  const entries = Object.entries(lockfile.tools || {}).filter(
    ([name]) => !toolNameFilter || name === toolNameFilter,
  );
  if (entries.length === 0) {
    if (toolNameFilter) {
      logger.info(`Tool "${toolNameFilter}" is not tracked in ${path.join(lockDir, LOCKFILE_NAME)}.`);
    } else {
      logger.info(`Lockfile present at ${path.join(lockDir, LOCKFILE_NAME)} but tracks no tools.`);
    }
    return;
  }
  let total = 0;
  for (const [toolName, section] of entries) {
    logger.info(`── ${toolName} ──`);
    const toolConfig = tools.tools?.[toolName];
    let toolDir;
    try {
      toolDir = resolveTargetPath(toolConfig || {}, section.scope || 'workspace', projectRoot);
    } catch {
      toolDir = '(unknown)';
    }
    logger.info(`Path:    ${toolDir}`);
    logger.info(`Scope:   ${section.scope || '(unknown)'}`);
    if (section.preset) logger.info(`Preset:  ${section.preset}`);
    if (section.source) logger.info(`Source:  ${section.source}`);
    if (section.installedAt) logger.info(`Updated: ${section.installedAt}`);
    logger.info('');

    let toolTotal = 0;
    for (const type of ASSET_TYPES) {
      if (!filter.includesType(type)) continue;
      const tracked = section.assets?.[type] || {};
      const names = Object.keys(tracked).filter((n) => filter.includesAsset(type, n));
      if (names.length === 0) continue;
      logger.info(`${type} (${names.length}):`);
      for (const name of names) {
        // MCP entries don't carry a file-copy `sha` field — fall back to
        // `valueSha` so each line still shows a stable identifier.
        const sha = tracked[name].sha || tracked[name].valueSha || '';
        const shortSha = sha.slice(0, 12);
        logger.info(`  ${name}${shortSha ? `  [${shortSha}]` : ''}`);
        toolTotal += 1;
      }
    }
    if (toolTotal === 0) {
      logger.info('  (no assets matching the filter)');
    }
    total += toolTotal;
    logger.info('');
  }
  if (total === 0) {
    logger.info('No assets matching the filter.');
  }
}

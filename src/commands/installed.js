import path from 'node:path';
import { loadTools, getTool, resolveTargetPath } from '../lib/tools.js';
import { loadManifest, resolvePreset } from '../lib/manifest.js';
import { read as readLockfile, LOCKFILE_NAME } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];

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

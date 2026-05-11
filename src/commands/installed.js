import path from 'node:path';
import { loadTools, getTool, resolveTargetPath, findInstalledTools } from '../lib/tools.js';
import { loadManifest, resolvePreset } from '../lib/manifest.js';
import { read as readLockfile } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function installed(opts = {}) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));
  const filter = buildFilter(opts, sourceRoot);

  // If a specific tool was requested, just show that one.
  if (opts.tool) {
    const tool = getTool(tools, opts.tool);
    const dir = resolveTargetPath(tool, opts.scope || 'workspace', projectRoot);
    reportLockfile({ logger, dir, projectRoot, filter });
    return;
  }

  // Otherwise scan tool subdirs under the project root.
  const found = findInstalledTools(tools, projectRoot);
  if (found.length === 0) {
    logger.info(`Nothing installed in ${projectRoot}.`);
    logger.info(`Looked for a lockfile inside each tool's subdir (.claude/, .cursor/, .github/, .kiro/, ...).`);
    return;
  }
  for (const entry of found) {
    logger.info(`── ${entry.tool} ──`);
    reportLockfile({ logger, dir: entry.dir, projectRoot, filter });
    logger.info('');
  }
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

function reportLockfile({ logger, dir, projectRoot, filter }) {
  const lockfile = readLockfile(dir);
  if (!lockfile) {
    logger.info(`No lockfile at ${path.relative(projectRoot, dir) || '.'}/.ai-toolkit-lock.json`);
    return;
  }
  logger.info(`Path:    ${dir}`);
  logger.info(`Tool:    ${lockfile.tool || '(unknown)'}`);
  logger.info(`Scope:   ${lockfile.scope || '(unknown)'}`);
  if (lockfile.preset) logger.info(`Preset:  ${lockfile.preset}`);
  if (lockfile.source) logger.info(`Source:  ${lockfile.source}`);
  if (lockfile.lastUpdatedAt) logger.info(`Updated: ${lockfile.lastUpdatedAt}`);
  logger.info('');

  let total = 0;
  for (const type of ASSET_TYPES) {
    if (!filter.includesType(type)) continue;
    const tracked = (lockfile.assets && lockfile.assets[type]) || {};
    const names = Object.keys(tracked).filter((n) => filter.includesAsset(type, n));
    if (names.length === 0) continue;
    logger.info(`${type} (${names.length}):`);
    for (const name of names) {
      const shortSha = (tracked[name].sha || '').slice(0, 12);
      logger.info(`  ${name}${shortSha ? `  [${shortSha}]` : ''}`);
      total += 1;
    }
  }
  if (total === 0) logger.info('Lockfile present but tracks no assets matching the filter.');
}

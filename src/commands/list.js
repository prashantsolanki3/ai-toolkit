import path from 'node:path';
import { loadManifest, listAssets, listPresets, resolvePreset } from '../lib/manifest.js';
import { loadTools, getTool, supportsAsset } from '../lib/tools.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function list(opts = {}) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const type = opts.type;
  const tools = loadTools(path.join(sourceRoot, 'config'));

  // --tool filter: throw early if the tool name is unknown so the user
  // gets a clear error instead of an empty report.
  const tool = opts.tool ? getTool(tools, opts.tool) : null;

  if (type === 'tools') {
    logger.info('Available tools:');
    for (const [name, def] of Object.entries(tools.tools)) {
      logger.info(`  ${name} — ${def.displayName} (supports: ${def.supportedAssets.join(', ')})`);
    }
    return;
  }

  const manifest = loadManifest(sourceRoot);

  if (type === 'presets') {
    logger.info('Available presets:');
    for (const name of listPresets(manifest)) {
      const contents = resolvePreset(manifest, name);
      const parts = [];
      for (const t of ASSET_TYPES) {
        if (contents[t].length) parts.push(`${t}: ${contents[t].join(', ')}`);
      }
      logger.info(`  ${name}`);
      for (const p of parts) logger.info(`      ${p}`);
    }
    return;
  }

  if (type && ASSET_TYPES.includes(type)) {
    if (tool && !supportsAsset(tool, type)) {
      logger.info(`Tool "${opts.tool}" does not support ${type}; nothing to list.`);
      return;
    }
    logger.info(`${type}:`);
    for (const name of listAssets(manifest, type)) {
      if (tool && !assetAllowedForTool(manifest, type, name, opts.tool)) continue;
      const def = manifest[type][name];
      logger.info(`  ${name}${def.description ? ` — ${def.description}` : ''}`);
    }
    return;
  }

  if (type) {
    throw new Error(
      `Unknown list type: ${type}. Use one of: ${[...ASSET_TYPES, 'presets', 'tools'].join(', ')}`,
    );
  }

  // Default: walk every asset type, but skip types the tool doesn't support
  // (if --tool was passed) and skip individual assets restricted to other
  // tools via the asset's own tools: allowlist.
  for (const t of ASSET_TYPES) {
    if (tool && !supportsAsset(tool, t)) continue;
    const items = listAssets(manifest, t).filter(
      (name) => !tool || assetAllowedForTool(manifest, t, name, opts.tool),
    );
    if (items.length === 0) continue;
    logger.info(`${t}:`);
    for (const name of items) {
      const def = manifest[t][name];
      logger.info(`  ${name}${def && def.description ? ` — ${def.description}` : ''}`);
    }
  }
  logger.info('presets:');
  for (const name of listPresets(manifest)) {
    logger.info(`  ${name}`);
  }
}

function assetAllowedForTool(manifest, type, name, toolName) {
  const entry = manifest[type]?.[name];
  if (!entry || !Array.isArray(entry.tools)) return true; // universal
  return entry.tools.includes(toolName);
}

import path from 'node:path';
import { loadManifest, listAssets, listPresets, resolvePreset } from '../lib/manifest.js';
import { loadTools } from '../lib/tools.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks'];

export async function list(opts = {}) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const type = opts.type;

  if (type === 'tools') {
    const tools = loadTools(path.join(sourceRoot, 'config'));
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
    logger.info(`${type}:`);
    for (const name of listAssets(manifest, type)) {
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

  for (const t of ASSET_TYPES) {
    const items = listAssets(manifest, t);
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

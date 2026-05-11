import { resolvePreset, getAsset } from './manifest.js';
import { supportsAsset } from './tools.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export function resolveInstallTargets(opts, manifest, tool) {
  const warnings = [];
  const merged = Object.fromEntries(ASSET_TYPES.map((t) => [t, []]));

  if (opts.preset) {
    const preset = resolvePreset(manifest, opts.preset);
    for (const type of ASSET_TYPES) {
      if (preset[type]) merged[type].push(...preset[type]);
    }
  }

  for (const type of ASSET_TYPES) {
    if (Array.isArray(opts[type])) {
      merged[type].push(...opts[type]);
    }
  }

  for (const type of ASSET_TYPES) {
    merged[type] = Array.from(new Set(merged[type]));
    for (const name of merged[type]) {
      getAsset(manifest, type, name);
    }
  }

  for (const type of ASSET_TYPES) {
    if (merged[type].length > 0 && !supportsAsset(tool, type)) {
      warnings.push(
        `Tool "${tool.displayName}" does not support ${type}; skipping ${merged[type].length} item(s).`,
      );
      merged[type] = [];
    }
  }

  return { ...merged, warnings };
}

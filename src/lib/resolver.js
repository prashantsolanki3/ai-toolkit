import { resolvePreset, getAsset } from './manifest.js';
import { supportsAsset } from './tools.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export function resolveInstallTargets(opts, manifest, tool, ctx = {}) {
  const warnings = [];
  const merged = Object.fromEntries(ASSET_TYPES.map((t) => [t, []]));
  const toolName = ctx.toolName;

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

  // Filter by tool capability and per-asset `tools:` allowlist.
  for (const type of ASSET_TYPES) {
    if (merged[type].length === 0) continue;
    if (!supportsAsset(tool, type)) {
      warnings.push(
        `Tool "${tool.displayName}" does not support ${type}; skipping ${merged[type].length} item(s).`,
      );
      merged[type] = [];
      continue;
    }
    if (toolName) {
      const dropped = [];
      merged[type] = merged[type].filter((name) => {
        const entry = manifest[type] && manifest[type][name];
        if (entry && Array.isArray(entry.tools) && !entry.tools.includes(toolName)) {
          dropped.push(name);
          return false;
        }
        return true;
      });
      for (const name of dropped) {
        warnings.push(
          `${type}/${name}: not installed because asset is restricted to other tools (this run: ${toolName}).`,
        );
      }
    }
  }

  return { ...merged, warnings };
}

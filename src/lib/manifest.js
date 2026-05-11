import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];
const REQUIRED = ['version', 'presets'];

export function loadManifest(rootDir = DEFAULT_ROOT) {
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found at ${manifestPath}`);
  }
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const key of REQUIRED) {
    if (!(key in data)) {
      throw new Error(`manifest.json missing required field: ${key}`);
    }
  }
  return data;
}

export function resolvePreset(manifest, name) {
  const preset = manifest.presets && manifest.presets[name];
  if (!preset) {
    const available = Object.keys(manifest.presets || {}).join(', ');
    throw new Error(`Unknown preset: ${name}. Available presets: ${available || '(none)'}`);
  }
  const result = {};
  for (const type of ASSET_TYPES) {
    result[type] = Array.isArray(preset[type]) ? [...preset[type]] : [];
  }
  return result;
}

export function listAssets(manifest, type) {
  const bucket = manifest[type];
  if (!bucket || typeof bucket !== 'object') return [];
  return Object.keys(bucket);
}

export function getAsset(manifest, type, name) {
  const asset = manifest[type] && manifest[type][name];
  if (!asset) {
    throw new Error(`Unknown ${type} asset: ${name}`);
  }
  return asset;
}

export function listPresets(manifest) {
  return Object.keys(manifest.presets || {});
}

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

const ASSET_SPECS = {
  skills: { kind: 'directory', entry: 'SKILL.md' },
  agents: { kind: 'directory', entry: 'agent.md' },
  commands: { kind: 'file', ext: '.md' },
  hooks: { kind: 'file', ext: '.sh', frontmatterKind: 'shell' },
  rules: { kind: 'file', ext: '.mdc' },
};

const ASSET_TYPES = Object.keys(ASSET_SPECS);

const RESERVED_FIELDS = new Set(['name', 'description', 'presets']);

export function generateManifest(sourceRoot) {
  const presetsConfig = loadPresetsConfig(sourceRoot);

  const manifest = { version: '1.0' };
  for (const type of ASSET_TYPES) manifest[type] = {};

  const presetMembership = {};
  for (const presetName of Object.keys(presetsConfig.presets)) {
    presetMembership[presetName] = { skills: [], agents: [], commands: [], hooks: [], rules: [] };
  }

  for (const type of ASSET_TYPES) {
    const spec = ASSET_SPECS[type];
    const assets = scanAssetType(sourceRoot, type, spec);

    const seen = new Set();
    for (const asset of assets) {
      if (seen.has(asset.name)) {
        throw new Error(`Duplicate ${type} name "${asset.name}" — each asset must have a unique name within its type.`);
      }
      seen.add(asset.name);

      validatePresets(asset, presetsConfig, type);

      manifest[type][asset.name] = assetEntry(asset);

      for (const preset of asset.presets || []) {
        presetMembership[preset][type].push(asset.name);
      }
    }
  }

  manifest.presets = {};
  for (const [name, def] of Object.entries(presetsConfig.presets)) {
    manifest.presets[name] = {
      description: def.description || '',
      skills: presetMembership[name].skills.sort(),
      agents: presetMembership[name].agents.sort(),
      commands: presetMembership[name].commands.sort(),
      hooks: presetMembership[name].hooks.sort(),
      rules: presetMembership[name].rules.sort(),
    };
  }

  return manifest;
}

function scanAssetType(sourceRoot, type, spec) {
  const dir = path.join(sourceRoot, type);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (spec.kind === 'directory' && entry.isDirectory()) {
      const file = path.join(dir, entry.name, spec.entry);
      if (!fs.existsSync(file)) continue;
      results.push(readAsset(file, entry.name, undefined));
    } else if (spec.kind === 'file' && entry.isFile() && entry.name.endsWith(spec.ext)) {
      const baseName = entry.name.slice(0, -spec.ext.length);
      const file = path.join(dir, entry.name);
      results.push(readAsset(file, baseName, spec.frontmatterKind));
    }
  }
  return results;
}

function readAsset(filePath, defaultName, frontmatterKind) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { data } = parseFrontmatter(content, frontmatterKind ? { kind: frontmatterKind } : undefined);
  const name = data.name || defaultName;
  return { ...data, name, file: filePath };
}

function assetEntry(asset) {
  const entry = {};
  if (asset.description != null) entry.description = asset.description;
  if (asset.presets != null) entry.presets = asset.presets;
  for (const [k, v] of Object.entries(asset)) {
    if (k === 'name' || k === 'file') continue;
    if (RESERVED_FIELDS.has(k)) continue;
    entry[k] = v;
  }
  return entry;
}

function validatePresets(asset, presetsConfig, type) {
  if (!Array.isArray(asset.presets)) return;
  for (const presetName of asset.presets) {
    if (!Object.prototype.hasOwnProperty.call(presetsConfig.presets, presetName)) {
      throw new Error(
        `${type}/${asset.name}: references unknown preset "${presetName}". Declare it in config/presets.json first.`,
      );
    }
  }
}

export function loadPresetsConfig(sourceRoot) {
  const file = path.join(sourceRoot, 'config', 'presets.json');
  if (!fs.existsSync(file)) {
    return { version: '1.0', presets: {} };
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.presets || typeof data.presets !== 'object') {
    throw new Error(`config/presets.json missing required "presets" object`);
  }
  return data;
}

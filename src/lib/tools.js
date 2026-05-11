import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = path.resolve(__dirname, '..', '..', 'config');

let _ajv = null;
function ajv() {
  if (!_ajv) _ajv = new Ajv({ allErrors: true });
  return _ajv;
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadTools(configDir = DEFAULT_CONFIG_DIR) {
  const toolsPath = path.join(configDir, 'tools.json');
  const schemaPath = path.join(configDir, 'tools.schema.json');

  if (!fs.existsSync(toolsPath)) {
    throw new Error(`tools.json not found at ${toolsPath}`);
  }

  const data = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));

  if (fs.existsSync(schemaPath)) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const validate = ajv().compile(schema);
    if (!validate(data)) {
      const errs = (validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
      throw new Error(`tools.json failed schema validation: ${errs}`);
    }
  }

  return data;
}

export function getTool(config, name) {
  const tool = config.tools && config.tools[name];
  if (!tool) {
    const available = Object.keys(config.tools || {}).join(', ');
    throw new Error(`Unknown tool: ${name}. Available tools: ${available || '(none)'}`);
  }
  return tool;
}

export function resolveTargetPath(tool, scope, override) {
  if (override) return expandHome(override);
  const target = tool.defaultTarget && tool.defaultTarget[scope];
  if (target == null) {
    throw new Error(
      `Tool does not support scope "${scope}" (defaultTarget.${scope} is null). Pass --target to override.`,
    );
  }
  return expandHome(target);
}

export function supportsAsset(tool, assetType) {
  return Array.isArray(tool.supportedAssets) && tool.supportedAssets.includes(assetType);
}

export function getAssetDestination(tool, targetDir, assetType, assetName) {
  if (!supportsAsset(tool, assetType)) {
    throw new Error(`Tool does not support asset type "${assetType}"`);
  }

  const subdir = tool.assetPaths[assetType];
  if (subdir == null) {
    throw new Error(`Tool config missing assetPaths.${assetType}`);
  }

  const format = tool.assetFormats[assetType];
  if (!format) {
    throw new Error(`Tool config missing assetFormats.${assetType}`);
  }

  const base = subdir === '' ? targetDir : path.join(targetDir, subdir);

  if (format.type === 'directory') {
    return path.join(base, assetName);
  }

  if (format.type === 'file') {
    const filename = (format.filename || '{name}').replace('{name}', assetName);
    return path.join(base, filename);
  }

  throw new Error(`Unknown asset format type: ${format.type}`);
}

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

// Resolve the on-disk install directory for a tool + scope.
//
// `projectRoot` is the user-facing --target: the directory the user is
// working in. The tool's own defaultTarget[scope] is the subdir under
// that root where the tool expects to read its configuration (e.g.
// .claude, .cursor, .github). For "global" scope the tool's path is
// typically absolute (~/.claude), in which case projectRoot is ignored.
//
// Defaults: if projectRoot is omitted, fall back to the caller's CWD.
export function resolveTargetPath(tool, scope, projectRoot) {
  const sub = tool.defaultTarget && tool.defaultTarget[scope];
  if (sub == null) {
    throw new Error(
      `Tool does not support scope "${scope}" (defaultTarget.${scope} is null).`,
    );
  }
  const expanded = expandHome(sub);
  if (path.isAbsolute(expanded)) return expanded;
  const root = projectRoot ? expandHome(projectRoot) : process.cwd();
  return path.resolve(root, expanded);
}

// Look up which tools are tracked in the project-root lockfile. With the
// v2.0 schema, every tool installed against this workspace appears under
// `tools.<name>` in a single .ai-toolkit-lock.json at the project root.
//
// Returns `[{ tool, dir }]` where `dir` is the resolved workspace target
// for that tool (e.g. .claude/, .cursor/) so callers can locate the files
// the tool placed on disk. Returns an empty array when no lockfile exists
// at the project root, or when no workspace-scoped tools are tracked.
export function findInstalledTools(config, projectRoot) {
  const root = projectRoot ? expandHome(projectRoot) : process.cwd();
  const lockPath = path.join(root, '.ai-toolkit-lock.json');
  let lockfile;
  try {
    if (!fs.statSync(lockPath).isFile()) return [];
    lockfile = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return [];
  }
  const found = [];
  for (const [name, section] of Object.entries(lockfile.tools || {})) {
    if (section?.scope && section.scope !== 'workspace') continue;
    const tool = config.tools?.[name];
    if (!tool) continue;
    let dir;
    try {
      dir = resolveTargetPath(tool, 'workspace', root);
    } catch {
      continue;
    }
    found.push({ tool: name, dir });
  }
  return found;
}

export function supportsAsset(tool, assetType) {
  return Array.isArray(tool.supportedAssets) && tool.supportedAssets.includes(assetType);
}

// MCP is the one asset type that doesn't follow the file-copy model — it
// merges a JSON entry into an existing per-tool config file at a fixed path.
// We resolve that path here so commands can stay agnostic of how each tool
// names or nests its MCP file.
export function getMcpConfigPath(tool, scope, projectRoot) {
  const cfg = tool.mcpConfig;
  if (!cfg || !cfg.file) {
    throw new Error(`Tool "${tool.displayName}" does not support MCP servers (no mcpConfig).`);
  }
  const file = cfg.file[scope];
  if (file == null) {
    throw new Error(
      `Tool "${tool.displayName}" does not support MCP at scope "${scope}" (mcpConfig.file.${scope} is null).`,
    );
  }
  const expanded = expandHome(file);
  if (path.isAbsolute(expanded)) return expanded;
  const root = projectRoot ? expandHome(projectRoot) : process.cwd();
  return path.resolve(root, expanded);
}

// Some tools (Claude Code) only fire an installed hook script when it is
// referenced from a settings file under a `hooks` block. hooksConfig declares
// where that settings file lives per scope and the wrapper key the hook
// entries nest under — the exact same model as mcpConfig. Tools without a
// hooksConfig don't support settings-level hook registration (the script is
// either discovered by other means, e.g. Kiro's .kiro.hook sidecar, or the
// tool has no hooks at all).
export function getSettingsConfigPath(tool, scope, projectRoot) {
  const cfg = tool.hooksConfig;
  if (!cfg || !cfg.file) {
    throw new Error(`Tool "${tool.displayName}" does not register hooks in a settings file (no hooksConfig).`);
  }
  const file = cfg.file[scope];
  if (file == null) {
    throw new Error(
      `Tool "${tool.displayName}" does not register hooks at scope "${scope}" (hooksConfig.file.${scope} is null).`,
    );
  }
  const expanded = expandHome(file);
  if (path.isAbsolute(expanded)) return expanded;
  const root = projectRoot ? expandHome(projectRoot) : process.cwd();
  return path.resolve(root, expanded);
}

export function getSettingsWrapperPath(tool) {
  const cfg = tool.hooksConfig;
  if (!cfg || !Array.isArray(cfg.wrapperPath)) {
    throw new Error(`Tool "${tool.displayName}" does not register hooks in a settings file (no hooksConfig.wrapperPath).`);
  }
  return [...cfg.wrapperPath];
}

export function getMcpWrapperPath(tool) {
  const cfg = tool.mcpConfig;
  if (!cfg || !Array.isArray(cfg.wrapperPath)) {
    throw new Error(`Tool "${tool.displayName}" does not support MCP servers (no mcpConfig.wrapperPath).`);
  }
  return [...cfg.wrapperPath];
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

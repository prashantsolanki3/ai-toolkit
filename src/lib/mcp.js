import fs from 'node:fs';
import path from 'node:path';
import {
  getMcpConfigPath,
  getMcpWrapperPath,
  supportsAsset,
} from './tools.js';
import {
  readJsonFile,
  mergeMcpEntry,
  removeMcpEntry,
  getAtPath,
  hashJsonValue,
} from './json-merge.js';

// Everything install/update/remove need to know about MCP lives here so the
// command files stay tight: branch on type === 'mcp', delegate to one of
// these helpers, treat the returned lockfile entry like any other.
//
// Each helper returns `{ status, ... }` where status is one of:
//   - 'installed' / 'updated' / 'removed'    — wrote to disk (or would have in --dry-run)
//   - 'skipped-scope'                        — tool has no config file for this scope
//   - 'skipped-conflict'                     — pre-existing entry at destination, no --force
//   - 'skipped-edited'                       — destination drifted from lockfile, no --force
//   - 'skipped-not-installed'                — remove asked for an entry not in the lockfile
//   - 'unchanged'                            — source matches lockfile and destination

// ── Source side ────────────────────────────────────────────────────────

// Read the canonical source JSON for an mcp asset. Throws if the source
// file is missing or malformed — same behaviour as resolveSourcePath does
// for the file-copy asset types.
export function loadMcpSource(sourceRoot, name) {
  const file = path.join(sourceRoot, 'mcp', `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Source asset missing: ${file}`);
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed.config || typeof parsed.config !== 'object') {
    throw new Error(`${file}: missing required "config" object`);
  }
  return { file, ...parsed };
}

// Resolve the final value to merge under wrapperPath[name]. We start from
// the source's `config` and overlay per-tool `overrides` from the manifest
// entry (same model that frontmatter overrides use elsewhere).
export function resolveMcpValue({ source, manifestEntry, toolName }) {
  const base = clone(source.config);
  const overrides = manifestEntry?.overrides?.[toolName];
  if (overrides && typeof overrides === 'object') {
    return { ...base, ...overrides };
  }
  return base;
}

// ── Destination side ──────────────────────────────────────────────────

// Returns { filePath, wrapperPath } for where this tool stores MCP at the
// requested scope — or null when the tool's config doesn't expose this
// scope (e.g. antigravity has no workspace MCP file).
export function resolveMcpDestination({ tool, scope, projectRoot }) {
  try {
    return {
      filePath: getMcpConfigPath(tool, scope, projectRoot),
      wrapperPath: getMcpWrapperPath(tool),
    };
  } catch {
    return null;
  }
}

// True if the file already has an entry under [wrapperPath][key].
function hasEntry({ filePath, wrapperPath, key }) {
  const data = readJsonFile(filePath);
  if (!data) return false;
  const wrapper = getAtPath(data, wrapperPath);
  return Boolean(wrapper && Object.hasOwn(wrapper, key));
}

// Current sha of the value currently under [wrapperPath][key], or null if
// no such entry exists.
function destValueSha({ filePath, wrapperPath, key }) {
  const data = readJsonFile(filePath);
  if (!data) return null;
  const wrapper = getAtPath(data, wrapperPath);
  if (!wrapper || !Object.hasOwn(wrapper, key)) return null;
  return hashJsonValue(wrapper[key]);
}

// ── Operations ────────────────────────────────────────────────────────

export function installMcpEntry({
  tool,
  toolName,
  scope,
  projectRoot,
  name,
  manifest,
  sourceRoot,
  trackedEntry,
  force,
  dryRun,
  logger,
}) {
  if (!supportsAsset(tool, 'mcp')) {
    const reason = `${tool.displayName} does not support MCP`;
    if (logger) logger.warn(`mcp/${name}: ${reason}; skipping.`);
    return { status: 'skipped-scope', reason };
  }
  const dest = resolveMcpDestination({ tool, scope, projectRoot });
  if (!dest) {
    const reason = `${tool.displayName} has no MCP config file at ${scope} scope`;
    if (logger) logger.warn(`mcp/${name}: ${reason}; skipping.`);
    return { status: 'skipped-scope', reason };
  }

  const source = loadMcpSource(sourceRoot, name);
  const manifestEntry = manifest?.mcp?.[name];
  const value = resolveMcpValue({ source, manifestEntry, toolName });

  // Conflict detection mirrors the file-copy semantics: an existing entry
  // is OK if our lockfile already owns it AND it hasn't been edited; it's
  // a conflict otherwise.
  const currentDestSha = destValueSha({ ...dest, key: name });
  if (hasEntry({ ...dest, key: name })) {
    const trackedDestSha = trackedEntry?.valueSha;
    const userEdited = trackedDestSha == null || trackedDestSha !== currentDestSha;
    if (userEdited && !force) {
      if (logger) {
        logger.warn(
          `mcp/${name}: destination entry already exists in ${path.relative(projectRoot, dest.filePath) || dest.filePath} and was not installed by ai-toolkit. Skipping; pass --force to overwrite.`,
        );
      }
      return { status: 'skipped-conflict', reason: 'destination entry exists' };
    }
  }

  if (dryRun) {
    if (logger) {
      logger.dryRun(`merge mcp/${name} into ${dest.filePath} under ${dest.wrapperPath.join('.')}`);
    }
    return { status: 'installed', dest, value, source };
  }

  mergeMcpEntry({ filePath: dest.filePath, wrapperPath: dest.wrapperPath, key: name, value });

  const entry = {
    configFile: path.relative(projectRoot, dest.filePath) || dest.filePath,
    wrapperPath: dest.wrapperPath.slice(),
    key: name,
    valueSha: hashJsonValue(value),
    sourceSha: hashJsonValue(source.config),
  };
  if (logger) logger.success(`installed mcp/${name}`);
  return { status: 'installed', dest, value, source, lockfileEntry: entry };
}

export function updateMcpEntry({
  tool,
  toolName,
  scope,
  projectRoot,
  name,
  manifest,
  sourceRoot,
  trackedEntry,
  force,
  dryRun,
  logger,
}) {
  if (!trackedEntry) {
    return { status: 'skipped-not-installed' };
  }
  const dest = resolveMcpDestination({ tool, scope, projectRoot });
  if (!dest) {
    return { status: 'skipped-scope', reason: `no MCP config at scope ${scope}` };
  }

  let source;
  try {
    source = loadMcpSource(sourceRoot, name);
  } catch {
    if (logger) logger.warn(`mcp/${name}: removed upstream — leaving in place, untrack via 'remove'`);
    return { status: 'missing' };
  }
  const manifestEntry = manifest?.mcp?.[name];
  const value = resolveMcpValue({ source, manifestEntry, toolName });

  const newSourceSha = hashJsonValue(source.config);
  const newValueSha = hashJsonValue(value);
  const currentDestSha = destValueSha({ ...dest, key: name });

  const sourceChanged = newSourceSha !== trackedEntry.sourceSha;
  const destEdited = currentDestSha != null && currentDestSha !== trackedEntry.valueSha;

  if (!sourceChanged && !destEdited) {
    return { status: 'unchanged' };
  }
  if (!sourceChanged && destEdited) {
    if (logger) logger.warn(`mcp/${name}: locally edited; nothing new upstream — leaving as-is`);
    return { status: 'skipped-edited', reason: 'local edits and no upstream change' };
  }
  if (destEdited && !force) {
    if (logger) logger.warn(`mcp/${name}: local edits detected — skipping. Re-run with --force to overwrite.`);
    return { status: 'skipped-edited', reason: 'local edits; use --force' };
  }

  if (dryRun) {
    if (logger) logger.dryRun(`update mcp/${name}`);
    return { status: 'updated' };
  }

  mergeMcpEntry({ filePath: dest.filePath, wrapperPath: dest.wrapperPath, key: name, value });
  const entry = {
    ...trackedEntry,
    configFile: path.relative(projectRoot, dest.filePath) || dest.filePath,
    wrapperPath: dest.wrapperPath.slice(),
    key: name,
    valueSha: newValueSha,
    sourceSha: newSourceSha,
  };
  if (logger) logger.success(`updated mcp/${name}`);
  return { status: 'updated', lockfileEntry: entry };
}

export function removeMcpEntryForCommand({
  tool,
  scope,
  projectRoot,
  name,
  trackedEntry,
  dryRun,
  logger,
}) {
  if (!trackedEntry) {
    if (logger) logger.warn(`mcp/${name}: not installed (skip)`);
    return { status: 'skipped-not-installed' };
  }
  // Prefer the lockfile's recorded configFile + wrapperPath (it might
  // belong to a tool/scope we haven't been asked to recompute), but fall
  // back to the tool's current MCP config if it's missing.
  let filePath;
  let wrapperPath;
  if (trackedEntry.configFile && Array.isArray(trackedEntry.wrapperPath)) {
    filePath = path.isAbsolute(trackedEntry.configFile)
      ? trackedEntry.configFile
      : path.resolve(projectRoot, trackedEntry.configFile);
    wrapperPath = trackedEntry.wrapperPath;
  } else {
    const dest = resolveMcpDestination({ tool, scope, projectRoot });
    if (!dest) return { status: 'skipped-scope' };
    filePath = dest.filePath;
    wrapperPath = dest.wrapperPath;
  }

  if (dryRun) {
    if (logger) logger.dryRun(`remove mcp/${name} from ${filePath}`);
    return { status: 'removed' };
  }
  removeMcpEntry({ filePath, wrapperPath, key: name });
  if (logger) logger.success(`removed mcp/${name}`);
  return { status: 'removed' };
}

function clone(v) {
  return structuredClone(v);
}

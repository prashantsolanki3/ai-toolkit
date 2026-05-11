import path from 'node:path';
import { loadTools, getTool, resolveTargetPath, getAssetDestination, supportsAsset } from '../lib/tools.js';
import { loadManifest } from '../lib/manifest.js';
import { resolveInstallTargets } from '../lib/resolver.js';
import { hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { resolveSourcePath, copyAssetAdaptive } from '../lib/source-adapter.js';
import { read as readLockfile, write as writeLockfile, addAsset, emptyLockfile } from '../lib/lockfile.js';
import { writeSidecar, frontmatterKindForFile } from '../lib/sidecar.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function install(opts) {
  if (!opts.tool) {
    return installAll(opts);
  }
  return installOne(opts);
}

async function installAll(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot = opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const tools = loadTools(path.join(sourceRoot, 'config'));
  const scope = opts.scope || 'workspace';
  const projectRoot = opts.target || process.cwd();

  const seenDirs = new Set();
  const results = [];

  for (const toolName of Object.keys(tools.tools)) {
    const tool = tools.tools[toolName];
    let dir;
    try {
      dir = resolveTargetPath(tool, scope, projectRoot);
    } catch (err) {
      logger.warn(`Skipping ${toolName}: ${err.message}`);
      results.push({ tool: toolName, skipped: true, reason: err.message });
      continue;
    }

    if (seenDirs.has(dir)) {
      logger.info(
        `Skipping ${toolName} — destination ${dir} already populated by a previous tool in this run.`,
      );
      results.push({ tool: toolName, skipped: true, reason: 'destination already populated' });
      continue;
    }
    seenDirs.add(dir);

    logger.info(`\n── ${toolName} (${tool.displayName}) ──`);
    try {
      const r = await installOne({ ...opts, tool: toolName });
      results.push({ tool: toolName, ...r });
    } catch (err) {
      logger.error(`Failed to install ${toolName}: ${err.message}`);
      results.push({ tool: toolName, error: err.message });
    }
  }

  const successful = results.filter((r) => r.lockfile != null);
  logger.info('');
  logger.info(`Installed for ${successful.length} tool(s).`);
  return { installedAll: results };
}

async function installOne(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot = opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const tools = loadTools(path.join(sourceRoot, 'config'));
  const tool = getTool(tools, opts.tool);
  const manifest = loadManifest(sourceRoot);

  const scope = opts.scope || 'workspace';
  const target = resolveTargetPath(tool, scope, opts.target);

  const plan = resolveInstallTargets(
    pickAssetSelectors(opts),
    manifest,
    tool,
    { toolName: opts.tool },
  );

  for (const warning of plan.warnings) logger.warn(warning);

  const totalAssets = ASSET_TYPES.reduce((n, t) => n + (plan[t]?.length || 0), 0);
  if (totalAssets === 0) {
    logger.warn('Nothing to install (no assets resolved for this tool).');
    return { target, installed: {}, lockfile: null };
  }

  const existingLockfile = readLockfile(target);

  if (opts.dryRun) {
    logger.info(`Would install into ${target} (tool: ${tool.displayName}, scope: ${scope})`);
    for (const type of ASSET_TYPES) {
      for (const name of plan[type] || []) {
        const dest = getAssetDestination(tool, target, type, name);
        const conflict = detectConflict({
          dest,
          destFormat: tool.assetFormats[type],
          tracked: existingLockfile?.assets?.[type]?.[name],
        });
        if (conflict && !opts.force) {
          logger.dryRun(`skip ${type}/${name} — destination exists and was not installed by ai-toolkit (use --force to overwrite)`);
        } else {
          logger.dryRun(`copy ${type}/${name} -> ${dest}`);
        }
      }
    }
    return { target, installed: plan, lockfile: null };
  }

  logger.info(`Installing into ${target} (tool: ${tool.displayName}, scope: ${scope})`);

  let lockfile = existingLockfile || emptyLockfile({
    tool: opts.tool,
    scope,
    source: opts.source || null,
    preset: opts.preset || null,
  });
  if (!lockfile.tool) lockfile.tool = opts.tool;
  if (!lockfile.preset && opts.preset) lockfile.preset = opts.preset;
  if (!lockfile.scope) lockfile.scope = scope;

  const installedSummary = {};
  const result = { installed: installedSummary, skipped: [] };

  for (const type of ASSET_TYPES) {
    if (!supportsAsset(tool, type)) continue;
    installedSummary[type] = [];
    for (const name of plan[type] || []) {
      const destFormat = tool.assetFormats[type];
      const source = resolveSourcePath({ sourceRoot, assetType: type, name, destFormat });
      const dest = getAssetDestination(tool, target, type, name);

      const conflict = detectConflict({
        dest,
        destFormat,
        tracked: lockfile.assets?.[type]?.[name],
      });
      if (conflict && !opts.force) {
        logger.warn(
          `${type}/${name}: destination already exists and was not installed by ai-toolkit (${conflict}). Skipping; pass --force to overwrite.`,
        );
        result.skipped.push({ type, name, reason: conflict });
        continue;
      }

      copyAssetAdaptive({
        sourcePath: source.path,
        sourceKind: source.kind,
        destPath: dest,
        destFormat,
        toolName: opts.tool,
        link: opts.link,
        onFallback: (msg) => logger.warn(`${type}/${name}: ${msg}`),
      });
      if (destFormat.sidecar) {
        writeSidecar({
          sourcePath: source.path,
          destPath: dest,
          sidecarSpec: destFormat.sidecar,
          assetName: name,
          frontmatterKind: frontmatterKindForFile(source.path),
        });
      }
      const sourceSha = source.kind === 'directory' ? hashDir(source.path) : hashFile(source.path);
      const destSha = destFormat.type === 'directory' ? hashDir(dest) : hashFile(dest);
      lockfile = addAsset(lockfile, type, name, {
        sourceSha,
        destSha,
        // legacy alias — older lockfiles used `sha` for the dest hash
        sha: destSha,
        sourcePath: path.posix.join(type, name + (destFormat.type === 'file' && source.kind === 'file' && !destFormat.sourceFile ? extFromFilename(destFormat.filename, name) : '')),
      });
      installedSummary[type].push(name);
      logger.success(`installed ${type}/${name}`);
    }
  }

  lockfile.lastUpdatedAt = new Date().toISOString();
  writeLockfile(target, lockfile);
  return { target, ...result, lockfile };
}

function detectConflict({ dest, destFormat, tracked }) {
  if (!pathExists(dest)) return null;
  if (!tracked) return 'untracked file at destination';
  const currentSha = destFormat.type === 'directory' ? hashDir(dest) : hashFile(dest);
  const trackedDest = tracked.destSha || tracked.sha;
  if (currentSha !== trackedDest) return 'destination differs from lockfile sha (local edits)';
  return null;
}

function pickAssetSelectors(opts) {
  return {
    preset: opts.preset,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
  };
}

function extFromFilename(template, name) {
  const expanded = (template || '{name}').replace('{name}', name);
  return expanded.slice(name.length);
}

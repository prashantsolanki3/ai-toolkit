import path from 'node:path';
import { loadTools, getTool, resolveTargetPath, getAssetDestination, supportsAsset } from '../lib/tools.js';
import { loadManifest } from '../lib/manifest.js';
import { resolveInstallTargets } from '../lib/resolver.js';
import { copyAsset, hashDir, hashFile, pathExists } from '../lib/fs-ops.js';
import { read as readLockfile, write as writeLockfile, addAsset, emptyLockfile } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function install(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot = opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  const tools = loadTools(path.join(sourceRoot, 'config'));
  const tool = getTool(tools, opts.tool);
  const manifest = loadManifest(sourceRoot);

  const scope = opts.scope || 'workspace';
  const target = resolveTargetPath(tool, scope, opts.target);

  const plan = resolveInstallTargets(
    {
      preset: opts.preset,
      skills: opts.skills,
      agents: opts.agents,
      commands: opts.commands,
      hooks: opts.hooks,
      rules: opts.rules,
    },
    manifest,
    tool,
  );

  for (const warning of plan.warnings) logger.warn(warning);

  const totalAssets = ASSET_TYPES.reduce((n, t) => n + plan[t].length, 0);
  if (totalAssets === 0) {
    logger.warn('Nothing to install (no assets resolved for this tool).');
    return { target, installed: {}, lockfile: null };
  }

  logger.info(`Installing into ${target} (tool: ${tool.displayName}, scope: ${scope})`);

  if (opts.dryRun) {
    for (const type of ASSET_TYPES) {
      for (const name of plan[type]) {
        const dest = getAssetDestination(tool, target, type, name);
        logger.dryRun(`copy ${type}/${name} -> ${dest}`);
      }
    }
    return { target, installed: plan, lockfile: null };
  }

  let lockfile = readLockfile(target) || emptyLockfile({
    tool: opts.tool,
    scope,
    source: opts.source || null,
    preset: opts.preset || null,
  });
  if (!lockfile.tool) lockfile.tool = opts.tool;
  if (!lockfile.preset && opts.preset) lockfile.preset = opts.preset;
  if (!lockfile.scope) lockfile.scope = scope;

  const installedSummary = {};
  for (const type of ASSET_TYPES) {
    if (!supportsAsset(tool, type)) continue;
    installedSummary[type] = [];
    for (const name of plan[type]) {
      const format = tool.assetFormats[type];
      const sourcePath = sourceAssetPath(sourceRoot, type, name, format);
      if (!pathExists(sourcePath)) {
        throw new Error(`Source asset missing: ${sourcePath}`);
      }
      const dest = getAssetDestination(tool, target, type, name);
      copyAsset(sourcePath, dest, format);
      const sha = format.type === 'directory' ? hashDir(dest) : hashFile(dest);
      lockfile = addAsset(lockfile, type, name, {
        sha,
        sourcePath: path.posix.join(typeToSourceDir(type), name + (format.type === 'file' ? extFromFilename(format.filename, name) : '')),
      });
      installedSummary[type].push(name);
      logger.success(`installed ${type}/${name}`);
    }
  }

  lockfile.lastUpdatedAt = new Date().toISOString();
  writeLockfile(target, lockfile);
  return { target, installed: installedSummary, lockfile };
}

function typeToSourceDir(type) {
  return type;
}

function extFromFilename(template, name) {
  const expanded = template.replace('{name}', name);
  return expanded.slice(name.length);
}

function sourceAssetPath(sourceRoot, type, name, format) {
  const dir = path.join(sourceRoot, typeToSourceDir(type));
  if (format.type === 'directory') {
    return path.join(dir, name);
  }
  const filename = (format.filename || '{name}').replace('{name}', name);
  return path.join(dir, filename);
}

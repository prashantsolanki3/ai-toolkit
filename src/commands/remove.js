import path from 'node:path';
import {
  loadTools,
  getTool,
  getAssetDestination,
  resolveTargetPath,
  supportsAsset,
  findInstalledTools,
} from '../lib/tools.js';
import { loadManifest, resolvePreset } from '../lib/manifest.js';
import { removePath, pathExists, cleanupEmptyDirs } from '../lib/fs-ops.js';
import {
  read as readLockfile,
  write as writeLockfile,
  removeAsset,
  LOCKFILE_NAME,
} from '../lib/lockfile.js';
import { removeSidecar } from '../lib/sidecar.js';
import { removeMcpEntryForCommand } from '../lib/mcp.js';
import { removeHookFromSettings } from '../lib/hooks-settings.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules', 'mcp'];

// Same rule as install/update: workspace lockfile lives at projectRoot,
// global at the tool's own global dir. Workspace tools therefore share a
// single lockfile; global tools each have their own.
function lockfileLocation({ scope, projectRoot, toolTarget }) {
  return scope === 'global' ? toolTarget : projectRoot;
}

export async function remove(opts) {
  const logger = opts.logger || createLogger();
  const sourceRoot =
    opts.sourceRoot || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const projectRoot = opts.target || process.cwd();
  const tools = loadTools(path.join(sourceRoot, 'config'));
  const scope = opts.scope || 'workspace';

  if (scope === 'global' && !opts.tool) {
    throw new Error(`--scope global requires --tool <name> (no autodiscovery for global scope).`);
  }

  // Decide which tool(s) we operate on.
  let toolNames;
  if (opts.tool) {
    toolNames = [opts.tool];
  } else {
    // No --tool: autodiscover from the project-root lockfile. Without
    // --all, the legacy single-tool semantics require exactly one match;
    // with --all, fan out across every installed tool.
    const found = findInstalledTools(tools, projectRoot);
    if (found.length === 0) {
      throw new Error(
        `No installed tools found under ${projectRoot}. Pass --tool <name> or --target <project-root>.`,
      );
    }
    if (!opts.all && found.length > 1) {
      const names = found.map((f) => f.tool).join(', ');
      throw new Error(
        `Multiple installed tools found under ${projectRoot} (${names}). Pass --tool <name> to disambiguate, or --all to remove from every tool.`,
      );
    }
    toolNames = found.map((f) => f.tool);
  }

  // Read every lockfile we'll touch, keyed by lockDir. Workspace = one
  // entry (projectRoot). Global = one entry per tool target.
  const lockfilesByDir = new Map();

  const aggregate = { removed: [], notFound: [] };

  for (const toolName of toolNames) {
    const tool = getTool(tools, toolName);
    const target = resolveTargetPath(tool, scope, projectRoot);
    const lockDir = lockfileLocation({ scope, projectRoot, toolTarget: target });

    let lockfile = lockfilesByDir.get(lockDir);
    if (lockfile === undefined) {
      lockfile = readLockfile(lockDir);
      if (!lockfile) {
        logger.warn(`No lockfile at ${path.join(lockDir, LOCKFILE_NAME)}; skipping ${toolName}.`);
        lockfilesByDir.set(lockDir, null);
        continue;
      }
      lockfilesByDir.set(lockDir, lockfile);
    } else if (lockfile === null) {
      continue;
    }

    const toolSection = lockfile.tools?.[toolName];
    if (!toolSection) {
      logger.warn(`Tool ${toolName} not tracked in lockfile at ${lockDir}; nothing to remove.`);
      continue;
    }

    const toRemove = pickRemovalSet({ opts, toolSection, sourceRoot });

    for (const type of ASSET_TYPES) {
      if (!toRemove[type] || toRemove[type].length === 0) continue;
      if (!supportsAsset(tool, type)) {
        logger.warn(`Tool ${tool.displayName} does not support ${type}; nothing to remove.`);
        continue;
      }
      for (const name of toRemove[type]) {
        const tracked = toolSection.assets?.[type]?.[name];
        if (!tracked) {
          logger.warn(`${type}/${name}: not installed (skip)`);
          aggregate.notFound.push({ type, name, tool: toolName });
          continue;
        }

        if (type === 'mcp') {
          const r = removeMcpEntryForCommand({
            tool,
            scope: toolSection.scope || scope,
            projectRoot,
            name,
            trackedEntry: tracked,
            dryRun: opts.dryRun,
            logger,
          });
          if (r.status === 'removed') {
            if (!opts.dryRun) {
              lockfile = removeAsset(lockfile, toolName, 'mcp', name);
              lockfilesByDir.set(lockDir, lockfile);
            }
            aggregate.removed.push({ type, name, tool: toolName });
          }
          continue;
        }

        const dest = getAssetDestination(tool, target, type, name);
        const sidecarSpec = tool.assetFormats[type]?.sidecar;
        // Hooks may have been registered in a settings file at install time
        // (issue #15). Unwire that entry too, using the registration the
        // lockfile recorded — never touching unrelated user hook entries.
        const settingsReg = type === 'hooks' ? tracked.settings : null;
        if (opts.dryRun) {
          logger.dryRun(`remove ${type}/${name} at ${dest}`);
          if (sidecarSpec) logger.dryRun(`remove sidecar for ${type}/${name}`);
          if (settingsReg) logger.dryRun(`unregister ${type}/${name} from ${settingsReg.file}`);
        } else {
          if (pathExists(dest)) removePath(dest);
          if (sidecarSpec) {
            removeSidecar({ destPath: dest, sidecarSpec, assetName: name });
          }
          if (settingsReg) {
            unregisterHookSettings({ settingsReg, projectRoot, name, logger });
          }
          lockfile = removeAsset(lockfile, toolName, type, name);
          lockfilesByDir.set(lockDir, lockfile);
          logger.success(`removed ${type}/${name}`);
        }
        aggregate.removed.push({ type, name, tool: toolName });
      }
    }

    // Per-tool: when the tool's section is empty after removals, scrub
    // any empty subtree under the tool's target dir so we don't strand
    // .claude/skills/ behind. Bounded by projectRoot.
    if (!opts.dryRun) {
      const stillHasAssets = ASSET_TYPES.some(
        (t) => Object.keys(lockfile.tools?.[toolName]?.assets?.[t] || {}).length > 0,
      );
      if (!stillHasAssets) {
        // Drop the empty tool section entirely.
        if (lockfile.tools?.[toolName]) {
          delete lockfile.tools[toolName];
          lockfilesByDir.set(lockDir, lockfile);
        }
        if (pathExists(target)) cleanupEmptyDirs(target, projectRoot);
      }
    }
  }

  // Finalize each lockfile we touched.
  if (!opts.dryRun) {
    for (const [lockDir, lockfile] of lockfilesByDir.entries()) {
      if (lockfile == null) continue;
      const remaining = Object.keys(lockfile.tools || {}).length;
      const lockfilePath = path.join(lockDir, LOCKFILE_NAME);
      if (remaining === 0) {
        if (pathExists(lockfilePath)) {
          removePath(lockfilePath);
          logger.success(`removed ${LOCKFILE_NAME}`);
        }
        // Tidy the lockfile's containing dir up to projectRoot (no-op for
        // workspace since lockDir IS projectRoot; for global, this lets
        // empty ~/.kiro/settings/ go away after the last global remove).
        if (lockDir !== projectRoot) cleanupEmptyDirs(lockDir, projectRoot);
      } else {
        lockfile.lastUpdatedAt = new Date().toISOString();
        writeLockfile(lockDir, lockfile);
      }
    }
  }

  return aggregate;
}

// Unwire a hook's settings registration recorded at install time. The
// lockfile stores file (relative to projectRoot), wrapperPath, event, command
// and optional matcher — enough to remove exactly our entry while leaving any
// unrelated user hook entries in the same file untouched.
//
// Best-effort: unregistration is a secondary cleanup, not the primary removal.
// The hook script has already been deleted by the time we get here, so a hook
// that can't be unwired (malformed settings JSON, unreadable/unwritable file)
// would only point at a now-missing script and won't fire anyway. Rather than
// throw — which would abort `remove` mid-flight, after deleting the script but
// before updating the lockfile, leaving a partial state — we surface a clear,
// actionable warning naming the file and the exact entry to hand-remove, then
// let removal continue. Returns true on success, false when skipped.
function unregisterHookSettings({ settingsReg, projectRoot, name, logger }) {
  const filePath = path.isAbsolute(settingsReg.file)
    ? settingsReg.file
    : path.resolve(projectRoot, settingsReg.file);
  try {
    removeHookFromSettings({
      filePath,
      wrapperPath: settingsReg.wrapperPath,
      event: settingsReg.event,
      command: settingsReg.command,
      matcher: settingsReg.matcher,
    });
    return true;
  } catch (err) {
    logger.warn(
      `hooks/${name}: could not unregister from ${filePath} (${err.message}). ` +
        `The hook script was removed, so it will no longer run, but the settings ` +
        `entry under ${settingsReg.wrapperPath.join('.')}.${settingsReg.event} ` +
        `(command: ${settingsReg.command}) may remain — remove it by hand if you want a clean file.`,
    );
    return false;
  }
}

// Build the per-type removal set from --all / --preset / --skills / etc.
function pickRemovalSet({ opts, toolSection, sourceRoot }) {
  const toRemove = Object.fromEntries(ASSET_TYPES.map((t) => [t, []]));

  if (opts.all) {
    for (const type of ASSET_TYPES) {
      toRemove[type] = Object.keys(toolSection.assets?.[type] || {});
    }
    return toRemove;
  }

  if (opts.preset) {
    const manifest = loadManifest(sourceRoot);
    const preset = resolvePreset(manifest, opts.preset);
    for (const type of ASSET_TYPES) {
      for (const name of preset[type] || []) toRemove[type].push(name);
    }
  }
  for (const type of ASSET_TYPES) {
    if (Array.isArray(opts[type])) toRemove[type].push(...opts[type]);
  }
  for (const type of ASSET_TYPES) {
    toRemove[type] = Array.from(new Set(toRemove[type]));
  }
  return toRemove;
}

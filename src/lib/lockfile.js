import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCKFILE_NAME = '.ai-toolkit-lock.json';
export const LOCKFILE_VERSION = '2.0';

// Schema v2.0 (multi-tool, project-root unified):
//
// {
//   "version": "2.0",
//   "installedAt": "<iso>",
//   "lastUpdatedAt": "<iso>",
//   "tools": {
//     "<toolName>": {
//       "scope": "workspace" | "global",
//       "preset": null | "<presetName>",
//       "source": null | "<git url>",
//       "installedAt": "<iso>",
//       "assets": {
//         "skills":   { "<name>": { sourceSha, destSha, sha, installedAt, sourcePath } },
//         "agents":   { ... },
//         "commands": { ... },
//         "hooks":    { ... },
//         "rules":    { ... },
//         "mcp":      { "<name>": { configFile, wrapperPath, key, valueSha, sourceSha, installedAt } }
//       }
//     }
//   }
// }
//
// Workspace lockfile lives at <projectRoot>/.ai-toolkit-lock.json — one file
// covering every tool installed against this project. Global lockfile lives
// at <toolGlobalDir>/.ai-toolkit-lock.json with the same schema but typically
// only one entry under `tools` (each global dir is tool-specific).

export function read(containingDir) {
  const file = path.join(containingDir, LOCKFILE_NAME);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return migrate(data);
}

export function write(containingDir, data) {
  fs.mkdirSync(containingDir, { recursive: true });
  const file = path.join(containingDir, LOCKFILE_NAME);
  const tmp = path.join(
    containingDir,
    `.${LOCKFILE_NAME}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function emptyLockfile() {
  const now = new Date().toISOString();
  return {
    version: LOCKFILE_VERSION,
    installedAt: now,
    lastUpdatedAt: now,
    tools: {},
  };
}

// Idempotent — call before adding the first asset for a tool. Preserves any
// pre-existing section (we never overwrite scope/preset/source set on a prior
// install run; the first install wins).
export function getOrInitTool(lockfile, toolName, opts = {}) {
  const next = clone(lockfile);
  next.tools ??= {};
  if (!next.tools[toolName]) {
    next.tools[toolName] = {
      scope: opts.scope || 'workspace',
      preset: opts.preset || null,
      source: opts.source || null,
      installedAt: new Date().toISOString(),
      assets: {},
    };
  }
  return next;
}

export function addAsset(lockfile, toolName, type, name, entry) {
  let next = clone(lockfile);
  next.tools ??= {};
  if (!next.tools[toolName]) {
    next = getOrInitTool(next, toolName);
  }
  next.tools[toolName].assets ??= {};
  next.tools[toolName].assets[type] ??= {};
  next.tools[toolName].assets[type][name] = {
    installedAt: new Date().toISOString(),
    ...entry,
  };
  return next;
}

export function removeAsset(lockfile, toolName, type, name) {
  const next = clone(lockfile);
  const bucket = next.tools?.[toolName]?.assets?.[type];
  if (bucket?.[name]) {
    delete bucket[name];
  }
  return next;
}

// migrate() is here to keep `read()` honest about what shape it returns.
// v2.0 passes through. v1.0 (single-tool, top-level `tool` + `assets`) is
// rejected with a clear error: we don't auto-migrate, callers must
// `ai-toolkit remove --all` and re-install on the new schema.
export function migrate(lockfile) {
  if (lockfile?.version === LOCKFILE_VERSION) {
    return lockfile;
  }
  const isLegacyV1 = lockfile?.version === '1.0' || (lockfile?.tool && lockfile?.assets);
  if (isLegacyV1) {
    throw new Error(
      `Lockfile is on the old v1.0 single-tool schema. The toolkit now uses a unified v2.0 lockfile at the project root. ` +
        `Run \`ai-toolkit remove --all\` against your old install (or just delete the per-tool lockfiles) and re-install to upgrade.`,
    );
  }
  // Anything else (unknown shape, future version) — fail loud rather than pretend.
  throw new Error(
    `Unrecognised lockfile schema (version=${lockfile?.version ?? '(none)'}). Expected v${LOCKFILE_VERSION}.`,
  );
}

function clone(obj) {
  return structuredClone(obj);
}

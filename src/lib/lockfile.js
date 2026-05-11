import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCKFILE_NAME = '.ai-toolkit-lock.json';
export const LOCKFILE_VERSION = '1.0';

export function read(targetDir) {
  const file = path.join(targetDir, LOCKFILE_NAME);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return migrate(data);
}

export function write(targetDir, data) {
  fs.mkdirSync(targetDir, { recursive: true });
  const file = path.join(targetDir, LOCKFILE_NAME);
  const tmp = path.join(
    targetDir,
    `.${LOCKFILE_NAME}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function addAsset(lockfile, type, name, entry) {
  const next = clone(lockfile);
  if (!next.assets) next.assets = {};
  if (!next.assets[type]) next.assets[type] = {};
  next.assets[type][name] = {
    installedAt: new Date().toISOString(),
    ...entry,
  };
  return next;
}

export function removeAsset(lockfile, type, name) {
  const next = clone(lockfile);
  if (next.assets && next.assets[type] && next.assets[type][name]) {
    delete next.assets[type][name];
  }
  return next;
}

export function migrate(lockfile) {
  if (lockfile && lockfile.version === LOCKFILE_VERSION) {
    return lockfile;
  }
  const next = { version: LOCKFILE_VERSION };
  if (lockfile.tool) next.tool = lockfile.tool;
  if (lockfile.scope) next.scope = lockfile.scope;
  if (lockfile.source) next.source = lockfile.source;
  if (lockfile.sourceSha) next.sourceSha = lockfile.sourceSha;
  if (lockfile.installedAt) next.installedAt = lockfile.installedAt;
  if (lockfile.lastUpdatedAt) next.lastUpdatedAt = lockfile.lastUpdatedAt;
  if (lockfile.preset) next.preset = lockfile.preset;

  if (lockfile.assets && typeof lockfile.assets === 'object') {
    next.assets = JSON.parse(JSON.stringify(lockfile.assets));
  } else {
    next.assets = {};
    for (const key of ['skills', 'agents', 'commands', 'hooks', 'rules']) {
      if (lockfile[key] && typeof lockfile[key] === 'object') {
        next.assets[key] = JSON.parse(JSON.stringify(lockfile[key]));
      }
    }
  }
  return next;
}

export function emptyLockfile({ tool, scope, source, preset } = {}) {
  const now = new Date().toISOString();
  return {
    version: LOCKFILE_VERSION,
    tool: tool || null,
    scope: scope || null,
    source: source || null,
    sourceSha: null,
    installedAt: now,
    lastUpdatedAt: now,
    preset: preset || null,
    assets: {},
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

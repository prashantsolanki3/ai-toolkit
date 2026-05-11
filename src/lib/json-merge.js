import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Read a JSON file. Returns null if the file is missing so callers can
// distinguish "no file yet" from "file is empty / corrupt" cleanly.
export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

// Atomic write: scratch file in the same directory, then rename. We use
// 2-space indent + trailing newline to match the rest of the toolkit
// (lockfile, tools.json, manifest.json) and to play nice with diff tools.
export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

// Walk a dot-path of keys; return undefined if any step misses.
export function getAtPath(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

// Immutable set: returns a shallow clone with `wrapperPath[].key = value`,
// creating any missing intermediate objects. Throws if the path tries to
// traverse a non-object value the user wrote.
export function setAtPath(obj, wrapperPath, key, value) {
  const root = isPlainObject(obj) ? { ...obj } : {};
  let cursor = root;
  for (let i = 0; i < wrapperPath.length; i++) {
    const segment = wrapperPath[i];
    const existing = cursor[segment];
    if (existing != null && !isPlainObject(existing)) {
      throw new Error(
        `setAtPath: cannot descend into ${joinPath(wrapperPath.slice(0, i + 1))} — value is not an object`,
      );
    }
    cursor[segment] = isPlainObject(existing) ? { ...existing } : {};
    cursor = cursor[segment];
  }
  cursor[key] = value;
  return root;
}

// Immutable unset: removes `key` under `wrapperPath`. Intermediate wrapper
// objects are preserved even when emptied — we explicitly DO NOT delete the
// wrapper, because the user (or another tool) may rely on it existing.
export function unsetAtPath(obj, wrapperPath, key) {
  const root = isPlainObject(obj) ? { ...obj } : {};
  if (wrapperPath.length === 0) {
    delete root[key];
    return root;
  }
  let cursor = root;
  for (let i = 0; i < wrapperPath.length; i++) {
    const segment = wrapperPath[i];
    const existing = cursor[segment];
    if (!isPlainObject(existing)) {
      // Nothing to remove under a path that doesn't exist as an object.
      return root;
    }
    cursor[segment] = { ...existing };
    cursor = cursor[segment];
  }
  if (key in cursor) delete cursor[key];
  return root;
}

// Stable, key-order-independent SHA-256 of a JSON value. Used to detect
// whether the entry we wrote has been edited by hand.
export function hashJsonValue(value) {
  const canonical = stringifyStable(value);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function stringifyStable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stringifyStable).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stringifyStable(value[k])).join(',') + '}';
}

// Higher-level helpers — the public surface that install/update/remove use.

export function mergeMcpEntry({ filePath, wrapperPath, key, value }) {
  const current = readJsonFile(filePath) || {};
  const next = setAtPath(current, wrapperPath, key, value);
  writeJsonFile(filePath, next);
  return next;
}

export function removeMcpEntry({ filePath, wrapperPath, key }) {
  if (!fs.existsSync(filePath)) return null;
  const current = readJsonFile(filePath) || {};
  const next = unsetAtPath(current, wrapperPath, key);
  writeJsonFile(filePath, next);
  return next;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function joinPath(keys) {
  return keys.join('.');
}

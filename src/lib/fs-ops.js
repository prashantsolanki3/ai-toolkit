import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full).map((p) => p));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export function hashDir(dir) {
  const files = walk(dir).sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    const rel = path.relative(dir, f);
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(f));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function pathExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function removePath(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function cleanupEmptyDirs(dirPath, stopAt) {
  /**
   * Remove empty directories starting from dirPath and moving up the tree,
   * stopping when we hit a non-empty directory or reach the stopAt path.
   * Also recursively cleans empty subdirectories within dirPath.
   * Returns the highest directory that was deleted, or null if none were deleted.
   */
  
  // First, recursively clean all empty subdirectories
  function cleanSubdirs(dir) {
    if (!pathExists(dir)) return;
    
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          cleanSubdirs(fullPath); // Recurse first
        }
      }
      
      // After cleaning subdirs, try to remove this dir if it's empty
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      // Silently ignore errors
    }
  }
  
  cleanSubdirs(dirPath);
  
  // Then move up the tree
  let current = path.dirname(dirPath);
  let lastDeleted = dirPath;

  while (current && current !== stopAt && pathExists(current)) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        // Directory is empty, delete it
        fs.rmdirSync(current);
        lastDeleted = current;
        current = path.dirname(current);
      } else {
        // Directory is not empty, stop
        break;
      }
    } catch {
      // If we can't read or delete, stop
      break;
    }
  }

  return lastDeleted;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

export function copyAsset(src, dest, format) {
  if (!format || !format.type) {
    throw new Error('copyAsset requires a format with a type');
  }
  if (format.type === 'directory') {
    if (pathExists(dest)) removePath(dest);
    copyDir(src, dest);
    return;
  }
  if (format.type === 'file') {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return;
  }
  throw new Error(`Unknown asset format type: ${format.type}`);
}

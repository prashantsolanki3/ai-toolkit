import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTmpProject(prefix = 'ai-toolkit-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

export function cleanupTmpProject(dir) {
  if (!dir) return;
  if (!dir.startsWith(os.tmpdir())) {
    throw new Error(`refusing to recursively delete path outside tmpdir: ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Publish-readiness assertions (ai-toolkit#16).
 *
 * Verifies that:
 *  1. package.json is NOT private (private !== true).
 *  2. publishConfig.access === 'public' is declared.
 *  3. The `files` allowlist includes every asset directory and the bin entry.
 *  4. The `files` allowlist excludes dev-only paths (test/, scripts/, PLAN.md).
 *  5. `npm pack --dry-run` confirms the packed tarball includes the required
 *     asset dirs and excludes dev cruft.
 *  6. The bin entry exists on disk and starts with a proper shebang.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

// Asset directories that MUST be present in the tarball.
const REQUIRED_DIRS = ['bin', 'src', 'config', 'skills', 'agents', 'commands', 'hooks', 'mcp', 'rules'];
// Files that MUST be present.
const REQUIRED_FILES = ['manifest.json', 'LICENSE', 'README.md'];
// Paths that must NOT appear in the tarball.
const EXCLUDED_PREFIXES = ['test/', 'scripts/', 'PLAN.md', '.claude/', '.cursor/', 'node_modules/'];

function packedPaths() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out)[0].files.map((f) => f.path);
}

test('package.json is not private', () => {
  assert.notStrictEqual(
    PKG.private,
    true,
    'package.json must not have private:true — set to false or remove the field',
  );
});

test('package.json has publishConfig.access === "public"', () => {
  assert.ok(PKG.publishConfig, 'package.json must have a publishConfig block');
  assert.strictEqual(
    PKG.publishConfig.access,
    'public',
    'publishConfig.access must be "public"',
  );
});

test('package.json has a non-empty files allowlist', () => {
  assert.ok(Array.isArray(PKG.files) && PKG.files.length > 0, 'package.json must have a non-empty "files" array');
});

test('files allowlist contains all required asset directories', () => {
  const listed = new Set(PKG.files);
  for (const dir of REQUIRED_DIRS) {
    assert.ok(listed.has(dir), `"files" allowlist must include "${dir}"`);
  }
});

test('npm pack --dry-run includes all required asset dirs', () => {
  const packed = packedPaths();
  for (const dir of REQUIRED_DIRS) {
    const hasEntry = packed.some((p) => p === dir || p.startsWith(dir + '/'));
    assert.ok(hasEntry, `Packed tarball must include at least one file from "${dir}/"`);
  }
});

test('npm pack --dry-run includes all required top-level files', () => {
  const packed = new Set(packedPaths());
  for (const f of REQUIRED_FILES) {
    assert.ok(packed.has(f), `Packed tarball must include "${f}"`);
  }
});

test('npm pack --dry-run excludes dev-only paths', () => {
  const packed = packedPaths();
  for (const prefix of EXCLUDED_PREFIXES) {
    const leaked = packed.filter((p) => p.startsWith(prefix));
    assert.strictEqual(
      leaked.length,
      0,
      `Packed tarball must not include "${prefix}" paths — found: ${leaked.join(', ')}`,
    );
  }
});

test('bin entry exists on disk and has a node shebang', () => {
  assert.ok(PKG.bin, 'package.json must have a "bin" field');
  const binEntries = typeof PKG.bin === 'string' ? [PKG.bin] : Object.values(PKG.bin);
  for (const rel of binEntries) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `bin entry "${rel}" must exist on disk at ${abs}`);
    const first = fs.readFileSync(abs, 'utf8').split('\n')[0];
    assert.ok(
      first.startsWith('#!/usr/bin/env node'),
      `bin entry "${rel}" must start with #!/usr/bin/env node, got: ${first}`,
    );
  }
});

test('package version is a valid SemVer (not 0.x pre-release)', () => {
  const ver = PKG.version;
  assert.ok(typeof ver === 'string', 'version must be a string');
  const semverRe = /^\d+\.\d+\.\d+$/;
  assert.ok(semverRe.test(ver), `version "${ver}" must be a valid SemVer (x.y.z)`);
  const [major] = ver.split('.').map(Number);
  assert.ok(major >= 1, `version major must be >= 1 for a publishable release, got "${ver}"`);
});

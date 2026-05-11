#!/usr/bin/env node
// Regenerate manifest.json from asset frontmatter.
//
// Modes:
//   default                — write manifest.json
//   --check / --verify     — exit non-zero if regen would change the file
//   --print                — print the generated manifest to stdout, don't write
//
// Run via `make register` (write) or `make verify-manifest` (check).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateManifest } from '../src/lib/manifest-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(SOURCE_ROOT, 'manifest.json');

const args = new Set(process.argv.slice(2));
const mode = args.has('--check') || args.has('--verify') ? 'check' : args.has('--print') ? 'print' : 'write';

const manifest = generateManifest(SOURCE_ROOT);
const serialized = JSON.stringify(manifest, null, 2) + '\n';

if (mode === 'print') {
  process.stdout.write(serialized);
  process.exit(0);
}

if (mode === 'check') {
  const current = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
  if (current === serialized) {
    process.stdout.write('✓ manifest.json is up to date\n');
    process.exit(0);
  }
  process.stderr.write('✗ manifest.json is stale — run `make register` to regenerate.\n');
  // Show a short diff hint without spamming the terminal.
  const currentLines = current.split('\n').length;
  const newLines = serialized.split('\n').length;
  process.stderr.write(`  current: ${currentLines} lines, generated: ${newLines} lines\n`);
  process.exit(1);
}

fs.writeFileSync(MANIFEST_PATH, serialized);
const counts = countAssets(manifest);
process.stdout.write(`✓ wrote manifest.json — ${counts}\n`);

function countAssets(m) {
  const parts = [];
  for (const t of ['skills', 'agents', 'commands', 'hooks', 'rules']) {
    const n = Object.keys(m[t] || {}).length;
    if (n) parts.push(`${n} ${t}`);
  }
  parts.push(`${Object.keys(m.presets || {}).length} presets`);
  return parts.join(', ');
}

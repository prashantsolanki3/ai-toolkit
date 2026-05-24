import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRESETS = path.join(REPO_ROOT, 'config', 'presets.json');

test('config/presets.json declares dev-skills with a non-empty description', () => {
  const data = JSON.parse(fs.readFileSync(PRESETS, 'utf8'));
  assert.ok(data.presets, 'config/presets.json must have a `presets` map');
  assert.ok(data.presets['dev-skills'], 'config/presets.json must declare `dev-skills`');
  const desc = data.presets['dev-skills'].description;
  assert.ok(typeof desc === 'string' && desc.length > 20, 'dev-skills must have a substantive description (>20 chars)');
});

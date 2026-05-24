import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Per ADR-0005 decision 3: floor 0.8; safe-change and review-pr may opt to 0.9.
const FLOOR = 0.8;
const NINE_OPT_IN = new Set(['safe-change', 'review-pr']);

const DEV_SKILLS_SKILLS = ['safe-change', 'review-pr', 'craft-skill', 'gh-project-sync'];

test('every dev-skills skill ships an eval.json that parses', () => {
  for (const name of DEV_SKILLS_SKILLS) {
    const p = path.join(REPO_ROOT, 'skills', name, 'eval.json');
    assert.ok(fs.existsSync(p), `skills/${name}/eval.json must exist`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(Array.isArray(data.tests) && data.tests.length >= 3, `${name}/eval.json must have >= 3 tests`);
    for (const t of data.tests) {
      assert.ok(typeof t.id === 'string' && t.id.length > 0, `${name}/eval.json: test.id required`);
      assert.ok(typeof t.input === 'string' && t.input.length > 0, `${name}/eval.json: test.input required`);
      assert.ok(Array.isArray(t.assertions) && t.assertions.length > 0, `${name}/eval.json: test.assertions[] required`);
    }
  }
});

test('eval target_pass_rate >= 0.8 floor; only safe-change and review-pr may set 0.9 (ADR-0005 decision 3)', () => {
  for (const name of DEV_SKILLS_SKILLS) {
    const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'skills', name, 'eval.json'), 'utf8'));
    const rate = data.target_pass_rate;
    assert.ok(typeof rate === 'number', `${name}: target_pass_rate must be a number`);
    assert.ok(rate >= FLOOR, `${name}: target_pass_rate ${rate} is below the ${FLOOR} floor (ADR-0005)`);
    if (rate > 0.8 + 1e-9) {
      assert.ok(
        NINE_OPT_IN.has(name),
        `${name}: only safe-change and review-pr may opt to >0.8 (got ${rate}); current allowed: ${[...NINE_OPT_IN].join(', ')}`,
      );
      assert.ok(rate <= 0.9 + 1e-9, `${name}: target_pass_rate ${rate} exceeds 0.9 cap`);
    }
  }
});

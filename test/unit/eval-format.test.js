import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const VALID_ASSERTION_TYPES = new Set([
  'contains',
  'not_contains',
  'contains_any_of',
  'contains_all_of',
  'exact',
  'not_exact_match',
  'regex',
  'not_regex',
  'min_length',
  'max_length',
]);

// Support the (?im) / (?i) / etc. inline-flag prefix so eval.json patterns
// can be authored in a portable, Python-style way. The agent runtime
// interprets these as the model sees fit; the validator just needs to
// confirm the pattern body is a valid JS regex once the flags are
// extracted.
function compileEvalRegex(pattern) {
  const m = pattern.match(/^\(\?([imsxu]+)\)/);
  if (m) {
    return new RegExp(pattern.slice(m[0].length), m[1]);
  }
  return new RegExp(pattern);
}

function findEvalFiles(root) {
  const out = [];
  for (const bucket of ['skills', 'agents']) {
    const dir = path.join(root, bucket);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const evalPath = path.join(dir, entry.name, 'eval.json');
      if (fs.existsSync(evalPath)) {
        out.push({ asset: `${bucket}/${entry.name}`, path: evalPath });
      }
    }
  }
  return out;
}

function validateEval(data, asset) {
  assert.equal(typeof data, 'object', `${asset}: eval.json must be an object`);
  assert.equal(data.version, '1.0', `${asset}: only version 1.0 is supported`);
  assert.ok(Array.isArray(data.tests), `${asset}: tests must be an array`);
  assert.ok(data.tests.length > 0, `${asset}: tests array must not be empty`);

  if (data.target_pass_rate !== undefined) {
    assert.ok(
      typeof data.target_pass_rate === 'number' && data.target_pass_rate >= 0 && data.target_pass_rate <= 1,
      `${asset}: target_pass_rate must be in [0, 1]`,
    );
  }

  const seenIds = new Set();
  for (const [i, t] of data.tests.entries()) {
    const ref = `${asset} test[${i}]`;
    assert.ok(typeof t.id === 'string' && t.id.length > 0, `${ref}: id required`);
    assert.ok(!seenIds.has(t.id), `${ref}: duplicate id "${t.id}"`);
    seenIds.add(t.id);
    assert.ok(typeof t.input === 'string' && t.input.length > 0, `${ref}: input required`);
    assert.ok(Array.isArray(t.assertions) && t.assertions.length > 0, `${ref}: assertions required`);

    for (const [j, a] of t.assertions.entries()) {
      const aref = `${ref}.assertions[${j}]`;
      assert.ok(VALID_ASSERTION_TYPES.has(a.type), `${aref}: unknown assertion type "${a.type}"`);
      assert.ok(a.value !== undefined, `${aref}: value required`);

      if (a.type === 'contains_any_of' || a.type === 'contains_all_of') {
        assert.ok(Array.isArray(a.value), `${aref}: ${a.type} expects an array`);
        assert.ok(a.value.length > 0, `${aref}: array must be non-empty`);
      } else if (a.type === 'min_length' || a.type === 'max_length') {
        assert.ok(typeof a.value === 'number' && a.value > 0, `${aref}: length must be a positive number`);
      } else if (a.type === 'regex' || a.type === 'not_regex') {
        assert.doesNotThrow(() => compileEvalRegex(a.value), `${aref}: invalid regex`);
      } else {
        assert.equal(typeof a.value, 'string', `${aref}: ${a.type} expects a string`);
      }
    }
  }
}

test('every eval.json in the source tree parses and matches the schema', () => {
  const files = findEvalFiles(REPO_ROOT);
  assert.ok(files.length > 0, 'expected at least one eval.json to exist (run `make register` if missing)');
  for (const { asset, path: p } of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
      throw new Error(`${asset}: failed to parse eval.json — ${err.message}`);
    }
    validateEval(data, asset);
  }
});

test('comprehensive-review eval.json declares a sensible target_pass_rate and at least 3 tests', () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'skills', 'comprehensive-review', 'eval.json'), 'utf8'),
  );
  assert.ok(data.target_pass_rate >= 0.5 && data.target_pass_rate <= 1);
  assert.ok(data.tests.length >= 3);
});

test('claude-code dir install carries eval.json through to the destination', async () => {
  const { install } = await import('../../src/commands/install.js');
  const { createTmpProject, cleanupTmpProject } = await import('../helpers/tmp-project.js');
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      skills: ['comprehensive-review'],
      target,
      sourceRoot: REPO_ROOT,
      logger: { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} },
    });
    assert.ok(
      fs.existsSync(path.join(target, 'skills', 'comprehensive-review', 'eval.json')),
      'dir-format install should carry eval.json alongside SKILL.md',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

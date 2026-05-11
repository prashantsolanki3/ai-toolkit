import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMcpValue,
  deepMerge,
  collectEmptyEnvKeys,
} from '../../src/lib/mcp.js';

// ── deepMerge ──────────────────────────────────────────────────────────

test('deepMerge: nested objects merge recursively, not replace', () => {
  const a = { env: { A: '1', B: '2' }, args: ['x'] };
  const b = { env: { B: 'overridden', C: '3' } };
  assert.deepEqual(deepMerge(a, b), {
    env: { A: '1', B: 'overridden', C: '3' },
    args: ['x'],
  });
});

test('deepMerge: arrays in the overlay replace, not concatenate', () => {
  // Arrays are leaf values for merge purposes — replacing is the safe
  // default since concatenation would silently double-add server args.
  const a = { args: ['a', 'b'] };
  const b = { args: ['c'] };
  assert.deepEqual(deepMerge(a, b), { args: ['c'] });
});

test('deepMerge: primitives in the overlay win over base', () => {
  assert.deepEqual(deepMerge({ command: 'npx', timeout: 1000 }, { timeout: 5000 }), {
    command: 'npx',
    timeout: 5000,
  });
});

test('deepMerge: keys absent from the overlay survive from the base', () => {
  assert.deepEqual(deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 } }), {
    a: 1,
    b: { c: 2, d: 3 },
  });
});

test('deepMerge: null in the overlay clears the base key', () => {
  // Explicit null at the leaf is the way to *remove* a base value via override.
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: null }), { a: 1, b: null });
});

test('deepMerge: input objects are not mutated', () => {
  const a = { env: { A: '1' } };
  const b = { env: { B: '2' } };
  const out = deepMerge(a, b);
  assert.deepEqual(a, { env: { A: '1' } });
  assert.deepEqual(b, { env: { B: '2' } });
  out.env.A = 'mutated';
  assert.equal(a.env.A, '1');
});

// ── resolveMcpValue overrides now go deep ──────────────────────────────

test('resolveMcpValue: per-tool overrides deep-merge into config (env keys preserve siblings)', () => {
  const source = {
    config: {
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { KEEP_ME: 'a', SHARED: 'base-value' },
    },
  };
  const manifestEntry = {
    overrides: {
      'gemini-cli': {
        env: { SHARED: 'gemini-value', GEMINI_ONLY: 'g' },
        timeout: 5000,
      },
    },
  };
  const result = resolveMcpValue({ source, manifestEntry, toolName: 'gemini-cli' });
  assert.deepEqual(result, {
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { KEEP_ME: 'a', SHARED: 'gemini-value', GEMINI_ONLY: 'g' },
    timeout: 5000,
  });
});

test('resolveMcpValue: no override leaves config untouched', () => {
  const source = { config: { command: 'x', env: { A: '1' } } };
  const result = resolveMcpValue({ source, manifestEntry: {}, toolName: 'claude-code' });
  assert.deepEqual(result, { command: 'x', env: { A: '1' } });
});

// ── collectEmptyEnvKeys ────────────────────────────────────────────────

test('collectEmptyEnvKeys: returns env keys whose value is empty or only-whitespace', () => {
  const value = {
    command: 'x',
    env: { GOOD: 'set', EMPTY: '', WHITESPACE: '   ', NULLVAL: null, OK: 'ok' },
  };
  assert.deepEqual(collectEmptyEnvKeys(value).sort(), ['EMPTY', 'NULLVAL', 'WHITESPACE']);
});

test('collectEmptyEnvKeys: returns env keys whose ${VAR} expansion would resolve to empty', () => {
  // A literal "${X}" with X unset (or empty) in process.env should be flagged.
  const prev = process.env.AI_TOOLKIT_TEST_VAR_DEFINITELY_UNSET;
  delete process.env.AI_TOOLKIT_TEST_VAR_DEFINITELY_UNSET;
  try {
    const value = {
      env: { LATE_BIND: '${AI_TOOLKIT_TEST_VAR_DEFINITELY_UNSET}' },
    };
    assert.deepEqual(collectEmptyEnvKeys(value), ['LATE_BIND']);
  } finally {
    if (prev !== undefined) process.env.AI_TOOLKIT_TEST_VAR_DEFINITELY_UNSET = prev;
  }
});

test('collectEmptyEnvKeys: a ${VAR} reference whose variable IS set is not flagged', () => {
  process.env.AI_TOOLKIT_TEST_VAR_SET = 'value';
  try {
    const value = { env: { OK: '${AI_TOOLKIT_TEST_VAR_SET}' } };
    assert.deepEqual(collectEmptyEnvKeys(value), []);
  } finally {
    delete process.env.AI_TOOLKIT_TEST_VAR_SET;
  }
});

test('collectEmptyEnvKeys: returns [] when env is absent', () => {
  assert.deepEqual(collectEmptyEnvKeys({ command: 'x' }), []);
});

test('collectEmptyEnvKeys: ${VAR:-default} pattern with a default is not flagged even when VAR unset', () => {
  delete process.env.AI_TOOLKIT_TEST_VAR_UNSET_WITH_DEFAULT;
  const value = { env: { HAS_DEFAULT: '${AI_TOOLKIT_TEST_VAR_UNSET_WITH_DEFAULT:-fallback}' } };
  assert.deepEqual(collectEmptyEnvKeys(value), []);
});

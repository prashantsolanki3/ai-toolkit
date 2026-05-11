import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readJsonFile,
  writeJsonFile,
  getAtPath,
  setAtPath,
  unsetAtPath,
  hashJsonValue,
  mergeMcpEntry,
  removeMcpEntry,
} from '../../src/lib/json-merge.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('readJsonFile() returns parsed JSON when the file exists', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, '{"foo":1}');
    assert.deepEqual(readJsonFile(file), { foo: 1 });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('readJsonFile() returns null when the file is missing', () => {
  const dir = createTmpProject();
  try {
    assert.equal(readJsonFile(path.join(dir, 'absent.json')), null);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('readJsonFile() throws on invalid JSON', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{ not json');
    assert.throws(() => readJsonFile(file), /JSON|parse/i);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('writeJsonFile() pretty-prints with trailing newline and creates parent dirs', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'nested', 'a.json');
    writeJsonFile(file, { a: 1, b: [2, 3] });
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content, '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('writeJsonFile() writes atomically (no tmp residue on disk)', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'a.json');
    writeJsonFile(file, { ok: true });
    const siblings = fs.readdirSync(dir);
    // Only the final file should remain — no .tmp scratch files.
    assert.deepEqual(siblings, ['a.json']);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('getAtPath() returns the nested value', () => {
  const obj = { servers: { foo: { command: 'x' } } };
  assert.deepEqual(getAtPath(obj, ['servers']), { foo: { command: 'x' } });
  assert.deepEqual(getAtPath(obj, ['servers', 'foo']), { command: 'x' });
});

test('getAtPath() returns undefined for missing paths', () => {
  assert.equal(getAtPath({}, ['servers']), undefined);
  assert.equal(getAtPath({ servers: {} }, ['servers', 'missing']), undefined);
});

test('setAtPath() returns a new object with the value set, preserving siblings', () => {
  const before = { other: 'untouched', servers: { existing: { url: 'x' } } };
  const after = setAtPath(before, ['servers'], 'newone', { command: 'cmd' });
  // immutability of the input
  assert.deepEqual(before.servers, { existing: { url: 'x' } });
  // result has both entries plus the unrelated key
  assert.deepEqual(after, {
    other: 'untouched',
    servers: {
      existing: { url: 'x' },
      newone: { command: 'cmd' },
    },
  });
});

test('setAtPath() creates missing intermediate objects', () => {
  const after = setAtPath({}, ['a', 'b'], 'c', { v: 1 });
  assert.deepEqual(after, { a: { b: { c: { v: 1 } } } });
});

test('setAtPath() throws if it would overwrite a non-object intermediate', () => {
  assert.throws(
    () => setAtPath({ a: 'string' }, ['a', 'b'], 'c', { v: 1 }),
    /not an object|cannot|conflict/i,
  );
});

test('unsetAtPath() removes the key, leaves siblings intact', () => {
  const before = { servers: { a: { x: 1 }, b: { x: 2 } } };
  const after = unsetAtPath(before, ['servers'], 'a');
  assert.deepEqual(after, { servers: { b: { x: 2 } } });
});

test('unsetAtPath() is a no-op when the key is absent', () => {
  const before = { servers: { b: { x: 2 } } };
  const after = unsetAtPath(before, ['servers'], 'missing');
  assert.deepEqual(after, before);
  assert.notEqual(after, before);
});

test('unsetAtPath() leaves an empty wrapper object behind, not null', () => {
  const before = { servers: { only: { x: 1 } } };
  const after = unsetAtPath(before, ['servers'], 'only');
  assert.deepEqual(after, { servers: {} });
});

test('hashJsonValue() is deterministic and key-order independent', () => {
  const a = hashJsonValue({ a: 1, b: 2 });
  const b = hashJsonValue({ b: 2, a: 1 });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('hashJsonValue() differs for different content', () => {
  assert.notEqual(hashJsonValue({ a: 1 }), hashJsonValue({ a: 2 }));
});

test('mergeMcpEntry() creates the file and wrapper when neither exists', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, '.mcp.json');
    mergeMcpEntry({
      filePath: file,
      wrapperPath: ['mcpServers'],
      key: 'foo',
      value: { command: 'npx', args: ['-y', 'pkg'] },
    });
    assert.deepEqual(readJsonFile(file), {
      mcpServers: { foo: { command: 'npx', args: ['-y', 'pkg'] } },
    });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('mergeMcpEntry() preserves unrelated top-level and sibling keys', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'settings.json');
    writeJsonFile(file, {
      theme: 'dark',
      mcpServers: { user: { command: 'echo' } },
    });
    mergeMcpEntry({
      filePath: file,
      wrapperPath: ['mcpServers'],
      key: 'ours',
      value: { command: 'npx' },
    });
    assert.deepEqual(readJsonFile(file), {
      theme: 'dark',
      mcpServers: {
        user: { command: 'echo' },
        ours: { command: 'npx' },
      },
    });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('mergeMcpEntry() overwrites our key when value changes', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, '.mcp.json');
    mergeMcpEntry({
      filePath: file,
      wrapperPath: ['mcpServers'],
      key: 'foo',
      value: { command: 'old' },
    });
    mergeMcpEntry({
      filePath: file,
      wrapperPath: ['mcpServers'],
      key: 'foo',
      value: { command: 'new' },
    });
    const data = readJsonFile(file);
    assert.equal(data.mcpServers.foo.command, 'new');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removeMcpEntry() removes only our key', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, '.mcp.json');
    writeJsonFile(file, {
      mcpServers: { ours: { command: 'a' }, theirs: { command: 'b' } },
    });
    removeMcpEntry({ filePath: file, wrapperPath: ['mcpServers'], key: 'ours' });
    assert.deepEqual(readJsonFile(file), {
      mcpServers: { theirs: { command: 'b' } },
    });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removeMcpEntry() is a no-op when the file is missing', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'absent.json');
    removeMcpEntry({ filePath: file, wrapperPath: ['mcpServers'], key: 'foo' });
    assert.equal(fs.existsSync(file), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removeMcpEntry() leaves the wrapper object in place (empty) when our key was the last entry', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, '.mcp.json');
    writeJsonFile(file, { mcpServers: { ours: { command: 'a' } } });
    removeMcpEntry({ filePath: file, wrapperPath: ['mcpServers'], key: 'ours' });
    assert.deepEqual(readJsonFile(file), { mcpServers: {} });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('mergeMcpEntry() supports a deep wrapperPath (e.g. settings -> mcpServers)', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'settings.json');
    writeJsonFile(file, { theme: 'dark', tools: { other: true } });
    mergeMcpEntry({
      filePath: file,
      wrapperPath: ['tools', 'mcpServers'],
      key: 'foo',
      value: { command: 'x' },
    });
    assert.deepEqual(readJsonFile(file), {
      theme: 'dark',
      tools: { other: true, mcpServers: { foo: { command: 'x' } } },
    });
  } finally {
    cleanupTmpProject(dir);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, stripFrontmatter } from '../../src/lib/frontmatter.js';

test('parseFrontmatter: returns empty object when no frontmatter', () => {
  const result = parseFrontmatter('plain body\nno fm\n');
  assert.deepEqual(result.data, {});
  assert.equal(result.body, 'plain body\nno fm\n');
});

test('parseFrontmatter: markdown ---/--- block', () => {
  const text = '---\nname: foo\ndescription: bar\npresets: [a, b]\n---\nbody here\n';
  const result = parseFrontmatter(text);
  assert.equal(result.data.name, 'foo');
  assert.equal(result.data.description, 'bar');
  assert.deepEqual(result.data.presets, ['a', 'b']);
  assert.equal(result.body, 'body here\n');
});

test('parseFrontmatter: malformed YAML throws with location info', () => {
  const text = '---\nname: foo\n  bad: [unterminated\n---\nbody\n';
  assert.throws(() => parseFrontmatter(text), /YAML|frontmatter/i);
});

test('parseFrontmatter: shell block delimited by `# === ai-toolkit metadata ===`', () => {
  const text = [
    '#!/usr/bin/env bash',
    '# === ai-toolkit metadata ===',
    '# name: pre-commit',
    '# description: lint staged files',
    '# presets: [quality-gates]',
    '# === end metadata ===',
    '',
    'set -euo pipefail',
  ].join('\n');
  const result = parseFrontmatter(text, { kind: 'shell' });
  assert.equal(result.data.name, 'pre-commit');
  assert.equal(result.data.description, 'lint staged files');
  assert.deepEqual(result.data.presets, ['quality-gates']);
  assert.match(result.body, /set -euo pipefail/);
});

test('parseFrontmatter: shell file with no metadata returns empty data', () => {
  const text = '#!/usr/bin/env bash\nset -e\necho hi\n';
  const result = parseFrontmatter(text, { kind: 'shell' });
  assert.deepEqual(result.data, {});
  assert.equal(result.body, text);
});

test('parseFrontmatter: shell metadata permits blank comment lines', () => {
  const text = [
    '#!/usr/bin/env bash',
    '# === ai-toolkit metadata ===',
    '#',
    '# name: foo',
    '#',
    '# === end metadata ===',
    'set -e',
  ].join('\n');
  const result = parseFrontmatter(text, { kind: 'shell' });
  assert.equal(result.data.name, 'foo');
});

test('stripFrontmatter: returns content with frontmatter removed for markdown', () => {
  const text = '---\nname: foo\n---\nactual content\n';
  assert.equal(stripFrontmatter(text), 'actual content\n');
});

test('stripFrontmatter: returns content unchanged when no frontmatter', () => {
  assert.equal(stripFrontmatter('hello world\n'), 'hello world\n');
});

test('parseFrontmatter: detects format from content (no need to pass kind for markdown)', () => {
  const text = '---\nname: x\n---\nbody\n';
  const result = parseFrontmatter(text);
  assert.equal(result.data.name, 'x');
});

test('parseFrontmatter: tools and presets parse as arrays', () => {
  const text = '---\nname: x\ntools: [claude-code, cursor]\npresets:\n  - backend-essentials\n  - quality-gates\n---\nbody\n';
  const result = parseFrontmatter(text);
  assert.deepEqual(result.data.tools, ['claude-code', 'cursor']);
  assert.deepEqual(result.data.presets, ['backend-essentials', 'quality-gates']);
});

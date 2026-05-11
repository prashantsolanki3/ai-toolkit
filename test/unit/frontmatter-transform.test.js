import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDestFrontmatter,
  serializeMarkdownWithFrontmatter,
  writeAdaptedFile,
} from '../../src/lib/frontmatter-transform.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('buildDestFrontmatter: substitutes {description} from source', () => {
  const out = buildDestFrontmatter(
    { description: '{description}', globs: '', alwaysApply: false },
    { description: 'The thing', name: 'thing' },
    'cursor',
  );
  assert.deepEqual(out, { description: 'The thing', globs: '', alwaysApply: false });
});

test('buildDestFrontmatter: omits keys whose source field is missing', () => {
  const out = buildDestFrontmatter(
    { description: '{description}', applyTo: '**' },
    { name: 'foo' },
    'vscode-copilot',
  );
  assert.deepEqual(out, { applyTo: '**' });
});

test('buildDestFrontmatter: literal values pass through', () => {
  const out = buildDestFrontmatter(
    { applyTo: '**/*.ts', enabled: true, priority: 10 },
    {},
    'vscode-copilot',
  );
  assert.deepEqual(out, { applyTo: '**/*.ts', enabled: true, priority: 10 });
});

test('buildDestFrontmatter: per-asset overrides win over template defaults', () => {
  const out = buildDestFrontmatter(
    { description: '{description}', globs: '', alwaysApply: false },
    {
      description: 'd',
      overrides: { cursor: { globs: '**/*.ts', alwaysApply: true } },
    },
    'cursor',
  );
  assert.deepEqual(out, { description: 'd', globs: '**/*.ts', alwaysApply: true });
});

test('buildDestFrontmatter: overrides for other tools are ignored', () => {
  const out = buildDestFrontmatter(
    { description: '{description}', applyTo: '**' },
    {
      description: 'd',
      overrides: { cursor: { globs: 'x' } },
    },
    'vscode-copilot',
  );
  assert.deepEqual(out, { description: 'd', applyTo: '**' });
});

test('buildDestFrontmatter: returns null when template is undefined (no transform)', () => {
  const out = buildDestFrontmatter(undefined, { description: 'd' }, 'claude-code');
  assert.equal(out, null);
});

test('serializeMarkdownWithFrontmatter: yaml block + body with one blank line', () => {
  const result = serializeMarkdownWithFrontmatter({ description: 'x', applyTo: '**' }, '# body\n');
  assert.match(result, /^---\n/);
  assert.match(result, /description: x/);
  assert.match(result, /applyTo:/);
  assert.match(result, /---\n\n# body\n/);
});

test('writeAdaptedFile: reads source SKILL.md, strips source frontmatter, writes new', () => {
  const dir = createTmpProject();
  try {
    const src = path.join(dir, 'SKILL.md');
    fs.writeFileSync(
      src,
      '---\nname: foo\ndescription: src desc\npresets:\n  - p1\n---\nactual body\n',
    );
    const dest = path.join(dir, 'foo.mdc');
    writeAdaptedFile({
      sourcePath: src,
      destPath: dest,
      frontmatterTemplate: { description: '{description}', globs: '', alwaysApply: false },
      toolName: 'cursor',
    });
    const written = fs.readFileSync(dest, 'utf8');
    assert.match(written, /description: src desc/);
    assert.match(written, /globs:/);
    assert.match(written, /alwaysApply: false/);
    assert.match(written, /actual body/);
    assert.doesNotMatch(written, /presets:/);
    assert.doesNotMatch(written, /^---\nname:/);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('writeAdaptedFile: per-asset overrides flow through to the written file', () => {
  const dir = createTmpProject();
  try {
    const src = path.join(dir, 'SKILL.md');
    fs.writeFileSync(
      src,
      '---\nname: foo\ndescription: src desc\noverrides:\n  cursor:\n    globs: "**/*.ts"\n    alwaysApply: true\n---\nbody\n',
    );
    const dest = path.join(dir, 'foo.mdc');
    writeAdaptedFile({
      sourcePath: src,
      destPath: dest,
      frontmatterTemplate: { description: '{description}', globs: '', alwaysApply: false },
      toolName: 'cursor',
    });
    const written = fs.readFileSync(dest, 'utf8');
    assert.match(written, /globs: ['"]?\*\*\/\*\.ts['"]?/);
    assert.match(written, /alwaysApply: true/);
  } finally {
    cleanupTmpProject(dir);
  }
});

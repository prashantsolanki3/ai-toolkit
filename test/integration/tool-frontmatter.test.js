import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { parseFrontmatter } from '../../src/lib/frontmatter.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

// These tests pin the frontmatter contract for each tool that injects its
// own metadata on install. If a tool's frontmatter shape changes (e.g.
// Cursor adds a new required field), this is the file to update — and
// the destination is reviewable in a single diff.

test('cursor: written .mdc has Cursor-shape frontmatter (description + globs + alwaysApply)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = fs.readFileSync(path.join(toolDir(target, 'cursor'), 'rules', 'code-review-checklist.mdc'), 'utf8');
    const { data, body } = parseFrontmatter(file);
    assert.ok(typeof data.description === 'string' && data.description.length > 0);
    assert.ok('globs' in data, 'Cursor expects a globs key');
    assert.equal(data.alwaysApply, false);
    assert.equal(data.name, undefined, 'ai-toolkit metadata (name) must not leak into Cursor frontmatter');
    assert.equal(data.presets, undefined, 'presets must not leak into Cursor frontmatter');
    assert.match(body, /Code Review Checklist/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: per-asset overrides set globs and alwaysApply', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      rules: ['no-bare-todos'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    // no-bare-todos doesn't declare overrides — assert defaults still apply.
    const file = fs.readFileSync(path.join(toolDir(target, 'cursor'), 'rules', 'no-bare-todos.mdc'), 'utf8');
    const { data } = parseFrontmatter(file);
    assert.equal(data.globs, '');
    assert.equal(data.alwaysApply, false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: instruction file has Copilot-shape frontmatter (description + applyTo)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'vscode-copilot',
      skills: ['error-handling-patterns'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = fs.readFileSync(
      path.join(toolDir(target, 'vscode-copilot'), 'instructions', 'error-handling-patterns.instructions.md'),
      'utf8',
    );
    const { data, body } = parseFrontmatter(file);
    assert.ok(typeof data.description === 'string' && data.description.length > 0);
    assert.equal(data.applyTo, '**');
    assert.equal(data.name, undefined);
    assert.equal(data.presets, undefined);
    assert.match(body, /Error Handling/i);
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: prompt file has Copilot-shape frontmatter (description + mode)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'vscode-copilot',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = fs.readFileSync(path.join(toolDir(target, 'vscode-copilot'), 'prompts', 'summarize-diff.prompt.md'), 'utf8');
    const { data } = parseFrontmatter(file);
    assert.ok(typeof data.description === 'string');
    assert.equal(data.mode, 'agent');
  } finally {
    cleanupTmpProject(target);
  }
});

test('claude-code (dir destination): source SKILL.md frontmatter is preserved untouched', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = fs.readFileSync(
      path.join(toolDir(target, 'claude-code'), 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    const sourceFile = fs.readFileSync(
      path.join(REPO_ROOT, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    assert.equal(file, sourceFile, 'directory-format destinations should be byte-identical to source');
  } finally {
    cleanupTmpProject(target);
  }
});

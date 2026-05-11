import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  return {
    info() {},
    success() {},
    warn() {},
    error() {},
    dryRun() {},
    verbose() {},
  };
}

// Update against tools whose destination is file-format (cursor's .mdc rules,
// vscode-copilot's .instructions.md). The previous update tests only covered
// dir-format destinations; this exercises the dir→file adapter at update
// time too.

function withTmpSource(originalSourceRoot, mutate) {
  const tmpSrc = createTmpProject('aitk-src-');
  // copy the parts of the source repo we need to mutate
  const subset = ['skills', 'agents', 'commands', 'hooks', 'config', 'manifest.json'];
  for (const sub of subset) {
    const src = path.join(originalSourceRoot, sub);
    const dst = path.join(tmpSrc, sub);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dst, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
  mutate(tmpSrc);
  return tmpSrc;
}

test('update: cursor (file dest) round-trips edits from source SKILL.md to .cursor/rules/*.mdc', async () => {
  const target = createTmpProject();
  const tmpSrc = withTmpSource(REPO_ROOT, () => {});
  try {
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: tmpSrc,
      logger: silentLogger(),
    });
    const ruleFile = path.join(toolDir(target, 'cursor'), 'rules', 'code-review-checklist.mdc');
    const before = fs.readFileSync(ruleFile, 'utf8');

    // mutate the upstream SKILL.md and ensure update picks up the new body
    fs.appendFileSync(
      path.join(tmpSrc, 'skills', 'code-review-checklist', 'SKILL.md'),
      '\n<!-- upstream edit -->\n',
    );

    const result = await update({ target, tool: 'cursor', sourceRoot: tmpSrc, logger: silentLogger() });
    assert.ok(result.updated.some((u) => u.name === 'code-review-checklist'));

    const after = fs.readFileSync(ruleFile, 'utf8');
    assert.notEqual(after, before);
    assert.ok(after.includes('upstream edit'));
  } finally {
    cleanupTmpProject(tmpSrc);
    cleanupTmpProject(target);
  }
});

test('update: claude-code agents (dir→file mapping) picks up upstream agent.md changes', async () => {
  const target = createTmpProject();
  const tmpSrc = withTmpSource(REPO_ROOT, () => {});
  try {
    await install({
      tool: 'claude-code',
      agents: ['senior-architect'],
      target,
      sourceRoot: tmpSrc,
      logger: silentLogger(),
    });
    const agentFile = path.join(toolDir(target, 'claude-code'), 'agents', 'senior-architect.md');
    const before = fs.readFileSync(agentFile, 'utf8');

    fs.appendFileSync(
      path.join(tmpSrc, 'agents', 'senior-architect', 'agent.md'),
      '\n<!-- new advisory -->\n',
    );

    const result = await update({ target, tool: 'claude-code', sourceRoot: tmpSrc, logger: silentLogger() });
    assert.ok(result.updated.some((u) => u.name === 'senior-architect'));

    const after = fs.readFileSync(agentFile, 'utf8');
    assert.notEqual(after, before);
    assert.ok(after.includes('new advisory'));
  } finally {
    cleanupTmpProject(tmpSrc);
    cleanupTmpProject(target);
  }
});

test('update: vscode-copilot instructions detect local edits and skip without --force', async () => {
  const target = createTmpProject();
  const tmpSrc = withTmpSource(REPO_ROOT, () => {});
  try {
    await install({
      tool: 'vscode-copilot',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: tmpSrc,
      logger: silentLogger(),
    });
    const inst = path.join(
      toolDir(target, 'vscode-copilot'),
      'instructions',
      'code-review-checklist.instructions.md',
    );

    fs.writeFileSync(inst, 'local-edit');
    fs.appendFileSync(
      path.join(tmpSrc, 'skills', 'code-review-checklist', 'SKILL.md'),
      '\nupstream\n',
    );

    const result = await update({ target, tool: 'vscode-copilot', sourceRoot: tmpSrc, logger: silentLogger() });
    assert.ok(result.skipped.some((s) => s.name === 'code-review-checklist'));
    assert.equal(fs.readFileSync(inst, 'utf8'), 'local-edit');

    const forced = await update({
      target,
      tool: 'vscode-copilot',
      sourceRoot: tmpSrc,
      force: true,
      logger: silentLogger(),
    });
    assert.ok(forced.updated.some((u) => u.name === 'code-review-checklist'));
    assert.match(fs.readFileSync(inst, 'utf8'), /upstream/);
  } finally {
    cleanupTmpProject(tmpSrc);
    cleanupTmpProject(target);
  }
});

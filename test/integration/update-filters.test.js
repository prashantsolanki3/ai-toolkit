import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

function copySourceRoot() {
  const tmpSrc = createTmpProject('aitk-src-update-filters-');
  for (const sub of ['skills', 'agents', 'commands', 'hooks', 'rules', 'config', 'manifest.json']) {
    const from = path.join(REPO_ROOT, sub);
    const to = path.join(tmpSrc, sub);
    if (fs.statSync(from).isDirectory()) fs.cpSync(from, to, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
  return tmpSrc;
}

function bumpSource(src, type, name, suffix) {
  const candidates = {
    skills: path.join(src, 'skills', name, 'SKILL.md'),
    agents: path.join(src, 'agents', name, 'agent.md'),
    commands: path.join(src, 'commands', `${name}.md`),
    hooks: path.join(src, 'hooks', `${name}.sh`),
    rules: path.join(src, 'rules', `${name}.mdc`),
  };
  fs.appendFileSync(candidates[type], `\n<!-- ${suffix} -->\n`);
}

test('update --skills a,b only updates the named skills', async () => {
  const target = createTmpProject();
  const src = copySourceRoot();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });

    // Bump TWO source files: one skill, one agent.
    bumpSource(src, 'skills', 'api-endpoint-design', 'updated-skill');
    bumpSource(src, 'agents', 'senior-architect', 'updated-agent');

    // Only ask for the skill update.
    const result = await update({
      target,
      tool: 'claude-code',
      sourceRoot: src,
      skills: ['api-endpoint-design'],
      logger: silentLogger(),
    });

    const updated = result.updated.map((u) => `${u.type}/${u.name}`);
    assert.deepEqual(updated, ['skills/api-endpoint-design']);

    const dir = toolDir(target, 'claude-code');
    const skillBody = fs.readFileSync(
      path.join(dir, 'skills', 'api-endpoint-design', 'SKILL.md'),
      'utf8',
    );
    assert.match(skillBody, /updated-skill/);

    const agentBody = fs.readFileSync(path.join(dir, 'agents', 'senior-architect.md'), 'utf8');
    assert.doesNotMatch(agentBody, /updated-agent/);
  } finally {
    cleanupTmpProject(src);
    cleanupTmpProject(target);
  }
});

test('update --preset filters to only assets in that preset (intersected with tracked)', async () => {
  const target = createTmpProject();
  const src = copySourceRoot();
  try {
    // Install BOTH backend-essentials and maintenance-mode so the lockfile
    // tracks assets from each. We do this by running two installs.
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });
    await install({
      tool: 'claude-code',
      preset: 'maintenance-mode',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });

    // Bump one asset in each preset.
    bumpSource(src, 'skills', 'api-endpoint-design', 'be-only');     // backend-essentials
    bumpSource(src, 'agents', 'refactoring-specialist', 'mm-only');  // maintenance-mode

    const result = await update({
      target,
      tool: 'claude-code',
      sourceRoot: src,
      preset: 'backend-essentials',
      logger: silentLogger(),
    });

    const updated = result.updated.map((u) => `${u.type}/${u.name}`);
    assert.ok(updated.includes('skills/api-endpoint-design'));
    assert.ok(!updated.includes('agents/refactoring-specialist'));

    const dir = toolDir(target, 'claude-code');
    const beSkill = fs.readFileSync(
      path.join(dir, 'skills', 'api-endpoint-design', 'SKILL.md'),
      'utf8',
    );
    assert.match(beSkill, /be-only/);

    const mmAgent = fs.readFileSync(
      path.join(dir, 'agents', 'refactoring-specialist.md'),
      'utf8',
    );
    assert.doesNotMatch(mmAgent, /mm-only/);
  } finally {
    cleanupTmpProject(src);
    cleanupTmpProject(target);
  }
});

test('update --preset + --skills unions both selections', async () => {
  const target = createTmpProject();
  const src = copySourceRoot();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });
    await install({
      tool: 'claude-code',
      preset: 'maintenance-mode',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });

    bumpSource(src, 'skills', 'api-endpoint-design', 'be');
    bumpSource(src, 'skills', 'dependency-upgrade', 'mm');
    bumpSource(src, 'agents', 'refactoring-specialist', 'mm-agent');

    const result = await update({
      target,
      tool: 'claude-code',
      sourceRoot: src,
      preset: 'backend-essentials',
      skills: ['dependency-upgrade'], // belongs to maintenance-mode
      logger: silentLogger(),
    });

    const updated = result.updated.map((u) => `${u.type}/${u.name}`).sort();
    assert.ok(updated.includes('skills/api-endpoint-design'));
    assert.ok(updated.includes('skills/dependency-upgrade'));
    assert.ok(!updated.includes('agents/refactoring-specialist'));
  } finally {
    cleanupTmpProject(src);
    cleanupTmpProject(target);
  }
});

test('update with no filters updates everything tracked (existing behaviour)', async () => {
  const target = createTmpProject();
  const src = copySourceRoot();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });
    bumpSource(src, 'skills', 'api-endpoint-design', 'a');
    bumpSource(src, 'agents', 'senior-architect', 'b');

    const result = await update({
      target,
      tool: 'claude-code',
      sourceRoot: src,
      logger: silentLogger(),
    });

    const updated = result.updated.map((u) => `${u.type}/${u.name}`).sort();
    assert.deepEqual(updated, ['agents/senior-architect', 'skills/api-endpoint-design']);
  } finally {
    cleanupTmpProject(src);
    cleanupTmpProject(target);
  }
});

test('update --skills <not-tracked> warns and proceeds with nothing', async () => {
  const target = createTmpProject();
  const src = copySourceRoot();
  const lines = [];
  const logger = {
    info: () => {}, success: () => {},
    warn: (m) => lines.push(['warn', m]),
    error: () => {}, dryRun: () => {}, verbose: () => {},
  };
  try {
    await install({
      tool: 'claude-code',
      skills: ['api-endpoint-design'],
      target,
      sourceRoot: src,
      logger: silentLogger(),
    });

    const result = await update({
      target,
      tool: 'claude-code',
      sourceRoot: src,
      skills: ['not-tracked-skill'],
      logger,
    });

    assert.deepEqual(result.updated, []);
    assert.ok(
      lines.some(([level, m]) => level === 'warn' && /not-tracked-skill/.test(m) && /tracked|installed/i.test(m)),
      `expected a 'not tracked' warning; got: ${JSON.stringify(lines)}`,
    );
  } finally {
    cleanupTmpProject(src);
    cleanupTmpProject(target);
  }
});

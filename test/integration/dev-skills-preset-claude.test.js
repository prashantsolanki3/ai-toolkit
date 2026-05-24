import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';
import { parseFrontmatter } from '../../src/lib/frontmatter.js';

function frontmatterOf(raw) {
  // parseFrontmatter returns { data, body } for markdown; { data, body } for shell.
  const { data } = parseFrontmatter(raw);
  return data;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function silentLogger() {
  return { logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, dryRun: () => {}, verbose: () => {} } };
}

test('install dev-skills --tool claude-code lands all 8 assets at expected paths', async () => {
  const target = createTmpProject();
  try {
    await install({ tool: 'claude-code', preset: 'dev-skills', target, sourceRoot: REPO_ROOT, ...silentLogger() });
    const installDir = toolDir(target, 'claude-code');

    // 4 skills
    for (const name of ['safe-change', 'review-pr', 'craft-skill', 'gh-project-sync']) {
      assert.ok(fs.existsSync(path.join(installDir, 'skills', name, 'SKILL.md')), `missing skills/${name}/SKILL.md`);
    }
    // 1 agent
    assert.ok(fs.existsSync(path.join(installDir, 'agents', 'wiki-keeper.md')), 'missing agents/wiki-keeper.md');
    // 2 commands
    for (const name of ['clean-gone', 'parallel-reviewers']) {
      assert.ok(fs.existsSync(path.join(installDir, 'commands', `${name}.md`)), `missing commands/${name}.md`);
    }
    // 1 hook
    assert.ok(fs.existsSync(path.join(installDir, 'hooks', 'branch-from-main.sh')), 'missing hooks/branch-from-main.sh');

    // Unified lockfile records all 8 under claude-code
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    const assets = lock.tools['claude-code'].assets;
    assert.equal(Object.keys(assets.skills || {}).length, 4, 'lockfile should record 4 skills');
    assert.equal(Object.keys(assets.agents || {}).length, 1, 'lockfile should record 1 agent');
    assert.equal(Object.keys(assets.commands || {}).length, 2, 'lockfile should record 2 commands');
    assert.equal(Object.keys(assets.hooks || {}).length, 1, 'lockfile should record 1 hook');
  } finally {
    cleanupTmpProject(target);
  }
});

test('every dev-skills asset frontmatter sets author: ai-toolkit-dev-skills (ADR-0005 decision 1)', () => {
  const assetPaths = [
    ['skills', 'safe-change/SKILL.md'],
    ['skills', 'review-pr/SKILL.md'],
    ['skills', 'craft-skill/SKILL.md'],
    ['skills', 'gh-project-sync/SKILL.md'],
    ['agents', 'wiki-keeper/agent.md'],
    ['commands', 'clean-gone.md'],
    ['commands', 'parallel-reviewers.md'],
  ];
  for (const [type, rel] of assetPaths) {
    const p = path.join(REPO_ROOT, type, rel);
    const raw = fs.readFileSync(p, 'utf8');
    const data = frontmatterOf(raw);
    assert.equal(data.author, 'ai-toolkit-dev-skills', `${type}/${rel} must set author: ai-toolkit-dev-skills`);
  }

  // Hook uses shell-comment metadata; grep for the line.
  const hook = fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'branch-from-main.sh'), 'utf8');
  assert.match(hook, /^# author: ai-toolkit-dev-skills$/m, 'hooks/branch-from-main.sh must set # author: ai-toolkit-dev-skills');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function silentLogger() {
  return { logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, dryRun: () => {}, verbose: () => {} } };
}

test('install dev-skills --tool vscode-copilot transforms skills + commands + agent; hook does NOT land', async () => {
  const target = createTmpProject();
  try {
    await install({ tool: 'vscode-copilot', preset: 'dev-skills', target, sourceRoot: REPO_ROOT, ...silentLogger() });
    const installDir = toolDir(target, 'vscode-copilot');

    // Skills that ship to vscode-copilot become instructions. gh-project-sync
    // is claude-code-only (ships an adjacent script vscode-copilot would drop)
    // so it must NOT land here.
    for (const name of ['safe-change', 'review-pr', 'craft-skill']) {
      assert.ok(
        fs.existsSync(path.join(installDir, 'instructions', `${name}.instructions.md`)),
        `missing instructions/${name}.instructions.md`,
      );
    }
    assert.ok(
      !fs.existsSync(path.join(installDir, 'instructions', 'gh-project-sync.instructions.md')),
      'gh-project-sync must NOT install for vscode-copilot (claude-code-only per ADR-0005 exception)',
    );
    // Agent
    assert.ok(fs.existsSync(path.join(installDir, 'agents', 'wiki-keeper.md')), 'missing agents/wiki-keeper.md');
    // Commands become prompts
    for (const name of ['clean-gone', 'parallel-reviewers']) {
      assert.ok(
        fs.existsSync(path.join(installDir, 'prompts', `${name}.prompt.md`)),
        `missing prompts/${name}.prompt.md`,
      );
    }
    // Hook does NOT land — vscode-copilot is not in the hook's tools allowlist.
    assert.ok(
      !fs.existsSync(path.join(installDir, 'hooks', 'branch-from-main.sh')),
      'hook must NOT install for vscode-copilot (ADR-0005 decision 2)',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

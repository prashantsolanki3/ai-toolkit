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

test('gh-project-sync ships scripts/github_project_tool.py with execute bit (source)', () => {
  const p = path.join(REPO_ROOT, 'skills', 'gh-project-sync', 'scripts', 'github_project_tool.py');
  assert.ok(fs.existsSync(p), `${p} must exist in the source tree (vendored from smart-agents-hub)`);
  const stat = fs.statSync(p);
  assert.ok(stat.mode & 0o100, `${p} must have the user-execute bit set`);

  // Sanity check: the script must be the SmartAgents-flavoured one (honours the
  // SMART_AGENTS env vars). Cheap content check.
  const head = fs.readFileSync(p, 'utf8').slice(0, 800);
  assert.match(head, /SMART_AGENTS_PROJECT_OWNER/, 'vendored script must honour SMART_AGENTS_PROJECT_OWNER');
  assert.match(head, /SMART_AGENTS_PROJECT_NUMBER/, 'vendored script must honour SMART_AGENTS_PROJECT_NUMBER');
});

test('install dev-skills --tool claude-code lands gh-project-sync script alongside SKILL.md', async () => {
  const target = createTmpProject();
  try {
    await install({ tool: 'claude-code', preset: 'dev-skills', target, sourceRoot: REPO_ROOT, ...silentLogger() });
    const installDir = toolDir(target, 'claude-code');
    const scriptPath = path.join(installDir, 'skills', 'gh-project-sync', 'scripts', 'github_project_tool.py');

    assert.ok(fs.existsSync(scriptPath), `${scriptPath} must exist after install`);
    const stat = fs.statSync(scriptPath);
    assert.ok(stat.mode & 0o100, `${scriptPath} must preserve the user-execute bit through install`);
  } finally {
    cleanupTmpProject(target);
  }
});

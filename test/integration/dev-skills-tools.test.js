import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function sortedTools(name, type, manifest) {
  const entry = manifest[type] && manifest[type][name];
  assert.ok(entry, `manifest.${type}.${name} not found — was \`make register\` run?`);
  const tools = entry.tools || [];
  return [...tools].sort();
}

const SLASH_HOSTS = ['claude-code', 'copilot-cli', 'vscode-copilot'].sort();
const AGENT_HOSTS = ['claude-code', 'copilot-cli', 'cursor', 'vscode-copilot'].sort();
const HOOK_HOSTS = ['claude-code', 'kiro'].sort();

test('tool allowlist per dev-skills asset matches ADR-0005 decision 2', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));

  // 4 skills + 2 commands → slash hosts
  for (const name of ['safe-change', 'review-pr', 'craft-skill', 'gh-project-sync']) {
    assert.deepEqual(sortedTools(name, 'skills', manifest), SLASH_HOSTS, `skills/${name} tools allowlist must equal ${JSON.stringify(SLASH_HOSTS)}`);
  }
  for (const name of ['clean-gone', 'parallel-reviewers']) {
    assert.deepEqual(sortedTools(name, 'commands', manifest), SLASH_HOSTS, `commands/${name} tools allowlist must equal ${JSON.stringify(SLASH_HOSTS)}`);
  }
  // 1 agent → agent hosts
  assert.deepEqual(sortedTools('wiki-keeper', 'agents', manifest), AGENT_HOSTS, `agents/wiki-keeper tools allowlist must equal ${JSON.stringify(AGENT_HOSTS)}`);
  // 1 hook → hook hosts
  assert.deepEqual(sortedTools('branch-from-main', 'hooks', manifest), HOOK_HOSTS, `hooks/branch-from-main tools allowlist must equal ${JSON.stringify(HOOK_HOSTS)}`);
});

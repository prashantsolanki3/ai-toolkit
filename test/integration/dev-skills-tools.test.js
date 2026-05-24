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

test('tool allowlist per dev-skills asset matches ADR-0005 decision 2 (with claude-code-only exception for gh-project-sync)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));

  // 3 of 4 slash-bearing skills → full slash-host triple.
  for (const name of ['safe-change', 'review-pr', 'craft-skill']) {
    assert.deepEqual(sortedTools(name, 'skills', manifest), SLASH_HOSTS, `skills/${name} tools allowlist must equal ${JSON.stringify(SLASH_HOSTS)}`);
  }
  // gh-project-sync ships an adjacent Python script. Only claude-code preserves
  // adjacent files; vscode-copilot and copilot-cli install skills as flat .md
  // and would drop the script. ADR-0005 decision 2 documents this exception.
  assert.deepEqual(sortedTools('gh-project-sync', 'skills', manifest), ['claude-code'], 'skills/gh-project-sync must be claude-code-only (adjacent script dependency)');

  for (const name of ['clean-gone', 'parallel-reviewers']) {
    assert.deepEqual(sortedTools(name, 'commands', manifest), SLASH_HOSTS, `commands/${name} tools allowlist must equal ${JSON.stringify(SLASH_HOSTS)}`);
  }
  assert.deepEqual(sortedTools('wiki-keeper', 'agents', manifest), AGENT_HOSTS, `agents/wiki-keeper tools allowlist must equal ${JSON.stringify(AGENT_HOSTS)}`);
  assert.deepEqual(sortedTools('branch-from-main', 'hooks', manifest), HOOK_HOSTS, `hooks/branch-from-main tools allowlist must equal ${JSON.stringify(HOOK_HOSTS)}`);
});

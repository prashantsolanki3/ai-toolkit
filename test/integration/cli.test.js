import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

// Spawn-based tests run the REAL CLI binary, which loads asset content from
// its own __dirname/.. (the real repo). They can't be redirected to a fake
// fixture — the binary's SOURCE_ROOT is baked in. So these assertions check
// against what's currently shipped (the minimal docs-maintainer + skill-
// development preset).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'bin', 'cli.js');

function run(args, opts = {}) {
  return spawnSync('node', [CLI, ...args], {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('cli: --help shows usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage|install|update|remove|list|installed/);
});

test('cli: list runs and prints skills section', () => {
  const r = run(['list']);
  assert.equal(r.status, 0);
  // skill-evaluator is the only skill the real repo currently ships.
  assert.match(r.stdout, /skill-evaluator/);
});

test('cli: list --type presets', () => {
  const r = run(['list', '--type', 'presets']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skill-development/);
});

test('cli: install / installed / remove flow via CLI', () => {
  const target = createTmpProject();
  try {
    const install = run([
      'install', '--tool', 'claude-code', '--preset', 'skill-development', '--target', target,
    ]);
    assert.equal(install.status, 0, `install failed: ${install.stderr}`);
    const dir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(dir, 'skills', 'skill-evaluator', 'SKILL.md')));

    const inst = run(['installed', '--target', target]);
    assert.equal(inst.status, 0);
    assert.match(inst.stdout, /claude-code/);
    assert.match(inst.stdout, /skill-evaluator/);

    const rem = run(['remove', '--target', target, '--skills', 'skill-evaluator']);
    assert.equal(rem.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'skills', 'skill-evaluator')), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('cli: unknown command exits non-zero', () => {
  const r = run(['no-such-command']);
  assert.notEqual(r.status, 0);
});

test('cli: --mcp flag installs an MCP server entry into the right per-tool file', () => {
  const target = createTmpProject();
  try {
    const r = run([
      'install', '--tool', 'claude-code', '--mcp', 'everything', '--target', target,
    ]);
    assert.equal(r.status, 0, `install failed: ${r.stderr}`);
    const mcpFile = path.join(target, '.mcp.json');
    assert.ok(fs.existsSync(mcpFile), '.mcp.json should exist at project root');
    const data = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
    assert.ok(data.mcpServers && data.mcpServers.everything, 'mcpServers.everything should be present');
  } finally {
    cleanupTmpProject(target);
  }
});

test('cli: list --type mcp prints MCP assets', () => {
  const r = run(['list', '--type', 'mcp']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /everything/);
});

test('cli: install --all without --preset installs every shipped asset', () => {
  const target = createTmpProject();
  try {
    const r = run(['install', '--tool', 'claude-code', '--all', '--target', target]);
    assert.equal(r.status, 0, `install --all failed: ${r.stderr}`);
    const dir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(dir, 'skills', 'skill-evaluator', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(dir, 'agents', 'docs-maintainer.md')));
    assert.ok(fs.existsSync(path.join(dir, 'commands', 'eval-skill.md')));
    assert.ok(fs.existsSync(path.join(dir, 'commands', 'improve-skill.md')));
    assert.ok(fs.existsSync(path.join(target, '.mcp.json')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('cli: install --dry-run does not write files', () => {
  const target = createTmpProject();
  try {
    const r = run([
      'install', '--tool', 'claude-code', '--preset', 'skill-development', '--target', target, '--dry-run',
    ]);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(path.join(toolDir(target, 'claude-code'), 'skills')), false);
    assert.match(r.stdout, /dry|would/i);
  } finally {
    cleanupTmpProject(target);
  }
});

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

test('cli: skill-evaluator is NOT installed on tools that lack slash-command support', () => {
  // skill-evaluator's body references /eval-skill and /improve-skill. Tools
  // without slash commands (Cursor, Antigravity, Gemini CLI, Kiro, Kiro CLI)
  // would receive a skill that points at commands they can't run. Its
  // frontmatter `tools:` allowlist must keep it off those tools.
  const target = createTmpProject();
  try {
    const r = run(['install', '--tool', 'cursor', '--preset', 'skill-development', '--target', target]);
    assert.equal(r.status, 0, `install failed: ${r.stderr}`);
    const dir = toolDir(target, 'cursor');
    assert.equal(
      fs.existsSync(path.join(dir, 'rules', 'skill-evaluator.mdc')),
      false,
      'skill-evaluator must NOT land on cursor — it references slash commands cursor cannot run',
    );
    // The warning surfaced is the same per-asset tools-allowlist message the
    // toolkit uses elsewhere — we just check it mentions the skill.
    assert.match(r.stdout + r.stderr, /skill-evaluator/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('cli: skill-evaluator IS installed on tools that have slash-command support', () => {
  // The flip side of the test above: command-capable tools still get it.
  const target = createTmpProject();
  try {
    const r = run(['install', '--tool', 'claude-code', '--preset', 'skill-development', '--target', target]);
    assert.equal(r.status, 0, `install failed: ${r.stderr}`);
    const dir = toolDir(target, 'claude-code');
    assert.ok(
      fs.existsSync(path.join(dir, 'skills', 'skill-evaluator', 'SKILL.md')),
      'skill-evaluator must land on claude-code',
    );
    assert.ok(fs.existsSync(path.join(dir, 'commands', 'eval-skill.md')));
    assert.ok(fs.existsSync(path.join(dir, 'commands', 'improve-skill.md')));
  } finally {
    cleanupTmpProject(target);
  }
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

test('cli: global hook install records an absolute settings path and remove unwires it from a different cwd', () => {
  // Reproduces the Copilot review on PR #19: a global-scope settings file
  // lives outside the project root, so its lockfile path must be absolute —
  // otherwise a later `remove` run from a different cwd resolves the wrong
  // file. We drive the REAL CLI with a fake HOME so ~/.claude points into a
  // throwaway dir, then run remove from an UNRELATED cwd.
  const home = createTmpProject('ai-toolkit-fakehome-');
  const elsewhere = createTmpProject('ai-toolkit-elsewhere-');
  const env = { ...process.env, NO_COLOR: '1', HOME: home };
  const runHome = (args, cwd) =>
    spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env });
  try {
    const ins = runHome(
      ['install', '--tool', 'claude-code', '--hooks', 'branch-from-main', '--scope', 'global'],
      REPO_ROOT,
    );
    assert.equal(ins.status, 0, `global install failed: ${ins.stderr}`);

    const settingsPath = path.join(home, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'global settings.json written under fake HOME');
    let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const before = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(before.some((c) => /branch-from-main\.sh/.test(c)), 'hook registered globally');

    // Lockfile records the settings file as an ABSOLUTE path.
    const lock = JSON.parse(
      fs.readFileSync(path.join(home, '.claude', '.ai-toolkit-lock.json'), 'utf8'),
    );
    const reg = lock.tools['claude-code'].assets.hooks['branch-from-main'].settings;
    assert.ok(reg, 'lockfile records the settings registration');
    assert.ok(path.isAbsolute(reg.file), `global settings path must be absolute, got ${reg.file}`);

    // Remove from an UNRELATED cwd — the bug was a relative path resolving
    // against this cwd and missing the real file.
    const rem = runHome(
      ['remove', '--tool', 'claude-code', '--hooks', 'branch-from-main', '--scope', 'global'],
      elsewhere,
    );
    assert.equal(rem.status, 0, `global remove failed: ${rem.stderr}`);

    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const after = (settings.hooks?.SessionStart || []).flatMap((g) => g.hooks.map((h) => h.command));
      assert.ok(
        !after.some((c) => /branch-from-main\.sh/.test(c)),
        'hook unwired from the global settings.json',
      );
    }
  } finally {
    cleanupTmpProject(home);
    cleanupTmpProject(elsewhere);
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

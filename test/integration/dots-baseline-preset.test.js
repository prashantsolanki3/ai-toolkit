// test/integration/dots-baseline-preset.test.js
//
// Regression coverage for ai-toolkit#14: the dots-owned generic Claude Code
// assets ingested into ai-toolkit and registered in the `dots-baseline` preset.
//
// These were authored TDD-first (RED before the assets existed); they now serve
// as the standing guarantee that the wiki commands, wiki-maintenance skill,
// preserve-effort-max hook, qmd/sonarqube MCP entries, and wiki-keeper agent
// stay present, correctly registered in the manifest + preset, and install/
// remove cleanly with a correct lockfile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';
import { parseFrontmatter } from '../../src/lib/frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function silentLogger() {
  return {
    logger: {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      dryRun: () => {},
      verbose: () => {},
    },
  };
}

function frontmatterOf(raw) {
  const { data } = parseFrontmatter(raw);
  return data;
}

// ── Section 1: source-on-disk layout ─────────────────────────────────────────

test('dots-baseline: commands/wiki-ingest.md exists on disk', () => {
  const p = path.join(REPO_ROOT, 'commands', 'wiki-ingest.md');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: commands/wiki-query.md exists on disk', () => {
  const p = path.join(REPO_ROOT, 'commands', 'wiki-query.md');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: commands/wiki-lint.md exists on disk', () => {
  const p = path.join(REPO_ROOT, 'commands', 'wiki-lint.md');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: skills/wiki-maintenance/SKILL.md exists on disk', () => {
  const p = path.join(REPO_ROOT, 'skills', 'wiki-maintenance', 'SKILL.md');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: hooks/preserve-effort-max.sh exists on disk', () => {
  const p = path.join(REPO_ROOT, 'hooks', 'preserve-effort-max.sh');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: mcp/qmd.json exists on disk', () => {
  const p = path.join(REPO_ROOT, 'mcp', 'qmd.json');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

test('dots-baseline: mcp/sonarqube.json exists on disk', () => {
  const p = path.join(REPO_ROOT, 'mcp', 'sonarqube.json');
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), `${p} must exist`);
});

// ── Section 2: frontmatter conventions ───────────────────────────────────────

test('dots-baseline: wiki commands have dots-baseline in presets', () => {
  for (const name of ['wiki-ingest', 'wiki-query', 'wiki-lint']) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, 'commands', `${name}.md`), 'utf8');
    const data = frontmatterOf(raw);
    assert.ok(
      Array.isArray(data.presets) && data.presets.includes('dots-baseline'),
      `commands/${name}.md must include dots-baseline in presets`,
    );
  }
});

test('dots-baseline: wiki-maintenance skill has dots-baseline in presets', () => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'wiki-maintenance', 'SKILL.md'), 'utf8');
  const data = frontmatterOf(raw);
  assert.ok(
    Array.isArray(data.presets) && data.presets.includes('dots-baseline'),
    'skills/wiki-maintenance/SKILL.md must include dots-baseline in presets',
  );
});

test('dots-baseline: preserve-effort-max.sh hook has dots-baseline in presets', () => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'preserve-effort-max.sh'), 'utf8');
  // Parse the shell-comment metadata block the same way the manifest generator
  // does, then assert on the actual parsed `presets` list — not on a substring
  // match against the whole file, which would pass even if `dots-baseline`
  // appeared only in a comment outside the metadata block.
  const { data } = parseFrontmatter(raw, { kind: 'shell' });
  assert.ok(
    Array.isArray(data.presets) && data.presets.includes('dots-baseline'),
    'hooks/preserve-effort-max.sh must include dots-baseline in its # presets: metadata list',
  );
});

test('dots-baseline: qmd.json has dots-baseline in presets', () => {
  const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'qmd.json'), 'utf8'));
  assert.ok(
    Array.isArray(data.presets) && data.presets.includes('dots-baseline'),
    'mcp/qmd.json must include dots-baseline in presets',
  );
});

test('dots-baseline: sonarqube.json has dots-baseline in presets', () => {
  const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'sonarqube.json'), 'utf8'));
  assert.ok(
    Array.isArray(data.presets) && data.presets.includes('dots-baseline'),
    'mcp/sonarqube.json must include dots-baseline in presets',
  );
});

// ── Section 3: manifest membership ───────────────────────────────────────────

test('dots-baseline: manifest.json has dots-baseline preset declared', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.presets?.['dots-baseline'], 'manifest must declare dots-baseline preset');
});

test('dots-baseline: manifest lists wiki commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  for (const name of ['wiki-ingest', 'wiki-query', 'wiki-lint']) {
    assert.ok(manifest.commands?.[name], `manifest.commands must include ${name}`);
  }
});

test('dots-baseline: manifest lists wiki-maintenance skill', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.skills?.['wiki-maintenance'], 'manifest.skills must include wiki-maintenance');
});

test('dots-baseline: manifest lists preserve-effort-max hook', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  assert.ok(
    manifest.hooks?.['preserve-effort-max'],
    'manifest.hooks must include preserve-effort-max',
  );
});

test('dots-baseline: manifest lists qmd mcp', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.mcp?.['qmd'], 'manifest.mcp must include qmd');
});

test('dots-baseline: manifest lists sonarqube mcp', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.mcp?.['sonarqube'], 'manifest.mcp must include sonarqube');
});

test('dots-baseline: manifest dots-baseline preset includes expected assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  const preset = manifest.presets?.['dots-baseline'];
  assert.ok(preset, 'dots-baseline preset must exist in manifest');
  assert.ok(preset.commands?.includes('wiki-ingest'), 'dots-baseline must include wiki-ingest command');
  assert.ok(preset.commands?.includes('wiki-query'), 'dots-baseline must include wiki-query command');
  assert.ok(preset.commands?.includes('wiki-lint'), 'dots-baseline must include wiki-lint command');
  assert.ok(preset.skills?.includes('wiki-maintenance'), 'dots-baseline must include wiki-maintenance skill');
  assert.ok(preset.hooks?.includes('preserve-effort-max'), 'dots-baseline must include preserve-effort-max hook');
  assert.ok(preset.mcp?.includes('qmd'), 'dots-baseline must include qmd mcp');
  assert.ok(preset.mcp?.includes('sonarqube'), 'dots-baseline must include sonarqube mcp');
  assert.ok(preset.agents?.includes('wiki-keeper'), 'dots-baseline must include wiki-keeper agent');
});

// ── Section 4: config/presets.json ───────────────────────────────────────────

test('dots-baseline: config/presets.json declares dots-baseline with description', () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'config', 'presets.json'), 'utf8'),
  );
  const p = data.presets?.['dots-baseline'];
  assert.ok(p, 'config/presets.json must declare dots-baseline');
  assert.ok(
    typeof p.description === 'string' && p.description.length > 20,
    'dots-baseline must have a substantive description (>20 chars)',
  );
});

// ── Section 5: install + lockfile correctness ─────────────────────────────────

test('dots-baseline: install --preset dots-baseline --tool claude-code lands all assets', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      preset: 'dots-baseline',
      target,
      sourceRoot: REPO_ROOT,
      ...silentLogger(),
    });
    const installDir = toolDir(target, 'claude-code');

    // commands
    for (const name of ['wiki-ingest', 'wiki-query', 'wiki-lint']) {
      assert.ok(
        fs.existsSync(path.join(installDir, 'commands', `${name}.md`)),
        `missing commands/${name}.md after install`,
      );
    }
    // skill
    assert.ok(
      fs.existsSync(path.join(installDir, 'skills', 'wiki-maintenance', 'SKILL.md')),
      'missing skills/wiki-maintenance/SKILL.md after install',
    );
    // hook
    assert.ok(
      fs.existsSync(path.join(installDir, 'hooks', 'preserve-effort-max.sh')),
      'missing hooks/preserve-effort-max.sh after install',
    );
    // agent
    assert.ok(
      fs.existsSync(path.join(installDir, 'agents', 'wiki-keeper.md')),
      'missing agents/wiki-keeper.md after install',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('dots-baseline: install --preset dots-baseline lockfile records all asset types', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      preset: 'dots-baseline',
      target,
      sourceRoot: REPO_ROOT,
      ...silentLogger(),
    });
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    const assets = lock.tools['claude-code'].assets;
    assert.ok(assets.commands?.['wiki-ingest'], 'lockfile must record wiki-ingest command');
    assert.ok(assets.commands?.['wiki-query'], 'lockfile must record wiki-query command');
    assert.ok(assets.commands?.['wiki-lint'], 'lockfile must record wiki-lint command');
    assert.ok(assets.skills?.['wiki-maintenance'], 'lockfile must record wiki-maintenance skill');
    assert.ok(assets.hooks?.['preserve-effort-max'], 'lockfile must record preserve-effort-max hook');
    assert.ok(assets.agents?.['wiki-keeper'], 'lockfile must record wiki-keeper agent');
  } finally {
    cleanupTmpProject(target);
  }
});

test('dots-baseline: install + remove is clean (no leftover files)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      preset: 'dots-baseline',
      target,
      sourceRoot: REPO_ROOT,
      ...silentLogger(),
    });
    await remove({
      tool: 'claude-code',
      preset: 'dots-baseline',
      target,
      sourceRoot: REPO_ROOT,
      ...silentLogger(),
    });
    const installDir = toolDir(target, 'claude-code');
    for (const name of ['wiki-ingest', 'wiki-query', 'wiki-lint']) {
      assert.ok(
        !fs.existsSync(path.join(installDir, 'commands', `${name}.md`)),
        `commands/${name}.md must be gone after remove`,
      );
    }
    assert.ok(
      !fs.existsSync(path.join(installDir, 'skills', 'wiki-maintenance')),
      'skills/wiki-maintenance must be gone after remove',
    );
    assert.ok(
      !fs.existsSync(path.join(installDir, 'hooks', 'preserve-effort-max.sh')),
      'hooks/preserve-effort-max.sh must be gone after remove',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

// ── Section 6: mcp config.json shape ─────────────────────────────────────────

test('dots-baseline: qmd.json has a config block with command field', () => {
  const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'qmd.json'), 'utf8'));
  assert.ok(data.config, 'mcp/qmd.json must have a config block');
  assert.ok(data.config.command, 'mcp/qmd.json config must have a command field');
});

test('dots-baseline: sonarqube.json has a config block with required env vars', () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'sonarqube.json'), 'utf8'),
  );
  assert.ok(data.config, 'mcp/sonarqube.json must have a config block');
  assert.ok(data.config.env, 'mcp/sonarqube.json config must have an env block');
  assert.ok(
    data.config.env.SONARQUBE_TOKEN,
    'mcp/sonarqube.json config.env must reference SONARQUBE_TOKEN',
  );
});

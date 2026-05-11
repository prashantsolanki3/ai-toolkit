import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function recordingLogger() {
  const lines = [];
  return {
    logger: {
      info: (m) => lines.push(['info', m]),
      success: (m) => lines.push(['success', m]),
      warn: (m) => lines.push(['warn', m]),
      error: (m) => lines.push(['error', m]),
      dryRun: (m) => lines.push(['dryRun', m]),
      verbose: (m) => lines.push(['verbose', m]),
    },
    lines,
  };
}

test('install (no --tool): installs the asset for every supported tool', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    const result = await install({
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // At least the four distinct destinations should have the skill.
    for (const toolName of ['claude-code', 'cursor', 'antigravity', 'gemini-cli', 'vscode-copilot', 'kiro']) {
      // Some tools install dir-format, others file-format. Just confirm SOMETHING
      // is at the resolved tool dir.
      const dir = toolDir(target, toolName);
      assert.ok(
        fs.existsSync(dir),
        `expected ${toolName} install dir to exist: ${dir}`,
      );
    }

    // The result should report the per-tool outcome.
    assert.ok(Array.isArray(result.installedAll));
    const installed = result.installedAll.filter((r) => r.lockfile != null);
    assert.ok(installed.length >= 5, `expected ≥5 tools installed, got ${installed.length}`);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install (no --tool): tools that share a workspace subdir are deduped', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    await install({
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // With the unified project-root lockfile, vscode-copilot writes its
    // section first; copilot-cli is skipped with a "destination already
    // populated" info line. The lockfile records only one of them.
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    assert.ok(lock.tools['vscode-copilot']);
    assert.equal(lock.tools['copilot-cli'], undefined);
    assert.ok(
      lines.some(([level, m]) => level === 'info' && /already populated/.test(m) && /copilot-cli/.test(m)),
      `expected a dedup message about copilot-cli; got: ${JSON.stringify(lines.filter((l) => /populated/.test(l[1])))}`,
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('install (no --tool): unified lockfile records every successfully-installed tool', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    await install({
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    for (const toolName of ['claude-code', 'cursor', 'antigravity', 'gemini-cli', 'kiro']) {
      assert.ok(
        lock.tools[toolName],
        `tools.${toolName} should appear in the unified lockfile`,
      );
      assert.equal(lock.tools[toolName].scope, 'workspace');
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('install (no --tool) with mixed assets: each tool installs what it supports', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    await install({
      skills: ['code-review-checklist'],
      agents: ['senior-architect'],
      commands: ['summarize-diff'],
      hooks: ['pre-commit-lint'],
      rules: ['no-bare-todos'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // Claude Code supports everything → all 5 land.
    const claude = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(claude, 'skills', 'code-review-checklist', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(claude, 'agents', 'senior-architect.md')));
    assert.ok(fs.existsSync(path.join(claude, 'commands', 'summarize-diff.md')));
    assert.ok(fs.existsSync(path.join(claude, 'hooks', 'pre-commit-lint.sh')));
    assert.ok(fs.existsSync(path.join(claude, 'rules', 'no-bare-todos.md')));

    // Cursor supports skills + rules + agents (subagents).
    const cursor = toolDir(target, 'cursor');
    assert.ok(fs.existsSync(path.join(cursor, 'rules', 'code-review-checklist.mdc')));
    assert.ok(fs.existsSync(path.join(cursor, 'rules', 'no-bare-todos.mdc')));
    assert.ok(fs.existsSync(path.join(cursor, 'agents', 'senior-architect.md')));
    assert.equal(fs.existsSync(path.join(cursor, 'commands')), false);
    assert.equal(fs.existsSync(path.join(cursor, 'hooks')), false);

    // Kiro supports skills + hooks. The hook becomes a steering + a .kiro.hook sidecar.
    const kiro = toolDir(target, 'kiro');
    assert.ok(fs.existsSync(path.join(kiro, 'steering', 'code-review-checklist.md')));
    assert.ok(fs.existsSync(path.join(kiro, 'hooks', 'pre-commit-lint.sh')));
    assert.ok(fs.existsSync(path.join(kiro, 'hooks', 'pre-commit-lint.kiro.hook')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install (no --tool) with dry-run plans for every tool without writing', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    await install({
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      dryRun: true,
      logger,
    });
    // No tool dirs should exist.
    for (const toolName of ['claude-code', 'cursor', 'antigravity', 'gemini-cli', 'kiro']) {
      assert.equal(fs.existsSync(toolDir(target, toolName)), false, `${toolName} dir should NOT exist after dry-run`);
    }
    // Every tool should have logged at least one dry-run plan line.
    const dryLines = lines.filter(([level]) => level === 'dryRun');
    assert.ok(dryLines.length >= 5, `expected ≥5 dryRun lines, got ${dryLines.length}`);
  } finally {
    cleanupTmpProject(target);
  }
});

test('installed (no --tool): reports every tool that has a lockfile', async () => {
  const { installed } = await import('../../src/commands/installed.js');
  const target = createTmpProject();
  const { logger: install_logger } = recordingLogger();
  const { logger, lines } = recordingLogger();
  try {
    await install({
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: install_logger,
    });
    await installed({ target, sourceRoot: REPO_ROOT, logger });
    const out = lines.map((l) => l[1]).join('\n');
    // Each tool with a lockfile should appear in the report.
    assert.match(out, /claude-code/);
    assert.match(out, /cursor/);
    assert.match(out, /kiro\b/);
  } finally {
    cleanupTmpProject(target);
  }
});

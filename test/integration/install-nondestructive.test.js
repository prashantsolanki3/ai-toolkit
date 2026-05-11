import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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

test('install: destination already exists, no lockfile → skip + warn (do not overwrite)', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    // Pre-create a destination file with unrelated content.
    fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'PRE-EXISTING USER CONTENT');

    await install({
      tool: 'claude-code',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const after = fs.readFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'utf8');
    assert.equal(after, 'PRE-EXISTING USER CONTENT', 'must not overwrite pre-existing user content');
    assert.ok(
      lines.some(([level, m]) => level === 'warn' && /summarize-diff/.test(m) && /(exist|force)/i.test(m)),
      `expected a clear warning, got: ${JSON.stringify(lines)}`,
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: --force overwrites pre-existing destination', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'PRE-EXISTING');

    await install({
      tool: 'claude-code',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      force: true,
      logger,
    });

    const after = fs.readFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'utf8');
    assert.notEqual(after, 'PRE-EXISTING');
    assert.match(after, /summarize/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: re-install over OWN previous install is idempotent (no warning)', async () => {
  const target = createTmpProject();
  const first = recordingLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger: first.logger,
    });
    const second = recordingLogger();
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger: second.logger,
    });
    const warns = second.lines.filter(
      ([level, m]) => level === 'warn' && /(exist|force)/i.test(m),
    );
    assert.deepEqual(warns, [], `re-install should not warn; got: ${JSON.stringify(warns)}`);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: pre-existing dir destination with unexpected files → skip + warn', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    // Pre-create a skill directory with random content (e.g. a user's own
    // hand-crafted skill that happens to share the name).
    fs.mkdirSync(path.join(target, 'skills', 'code-review-checklist'), { recursive: true });
    fs.writeFileSync(
      path.join(target, 'skills', 'code-review-checklist', 'SKILL.md'),
      'MY HAND-CRAFTED SKILL',
    );

    await install({
      tool: 'claude-code',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const after = fs.readFileSync(
      path.join(target, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    assert.equal(after, 'MY HAND-CRAFTED SKILL');
    assert.ok(lines.some(([level, m]) => level === 'warn' && /code-review-checklist/.test(m)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: skipped assets are NOT recorded in the lockfile', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'PRE-EXISTING');

    await install({
      tool: 'claude-code',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    assert.equal(
      lock.assets.commands && lock.assets.commands['summarize-diff'],
      undefined,
      'skipped install must not write a lockfile entry',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: dryRun reports an "already exists" plan without writing or warning', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'PRE-EXISTING');

    await install({
      tool: 'claude-code',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      dryRun: true,
      logger,
    });

    const after = fs.readFileSync(path.join(target, 'commands', 'summarize-diff.md'), 'utf8');
    assert.equal(after, 'PRE-EXISTING');
    // No lockfile created
    assert.equal(fs.existsSync(path.join(target, LOCKFILE_NAME)), false);
    // The plan should mention that this destination would be skipped without --force
    assert.ok(
      lines.some(([level, m]) => level === 'dryRun' && /skip|force|exist/i.test(m)),
      `expected dry-run plan to flag the conflict; got: ${JSON.stringify(lines)}`,
    );
  } finally {
    cleanupTmpProject(target);
  }
});

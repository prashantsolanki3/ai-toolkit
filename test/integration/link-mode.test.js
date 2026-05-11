import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

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

test('link: claude-code skill (dir→dir, no transform) creates a symlink', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    await install({
      tool: 'claude-code',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      link: true,
      logger,
    });
    const dest = path.join(toolDir(target, 'claude-code'), 'skills', 'code-review-checklist');
    const stat = fs.lstatSync(dest);
    assert.ok(stat.isSymbolicLink(), 'expected a symlink at the destination');
    // Following the symlink should land on the source.
    const resolved = fs.realpathSync(dest);
    const expected = fs.realpathSync(path.join(REPO_ROOT, 'skills', 'code-review-checklist'));
    assert.equal(resolved, expected);
  } finally {
    cleanupTmpProject(target);
  }
});

test('link: claude-code command (file→file, no transform) creates a symlink', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    await install({
      tool: 'claude-code',
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      link: true,
      logger,
    });
    const dest = path.join(toolDir(target, 'claude-code'), 'commands', 'summarize-diff.md');
    const stat = fs.lstatSync(dest);
    assert.ok(stat.isSymbolicLink());
  } finally {
    cleanupTmpProject(target);
  }
});

test('link: cursor skill (frontmatter transform required) falls back to copy + warns', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      link: true,
      logger,
    });
    const dest = path.join(toolDir(target, 'cursor'), 'rules', 'code-review-checklist.mdc');
    const stat = fs.lstatSync(dest);
    assert.ok(!stat.isSymbolicLink(), 'frontmatter transform forces a copy, not a symlink');
    assert.ok(
      lines.some(([level, m]) => level === 'warn' && /symlink|copied|frontmatter/i.test(m)),
      `expected a warning about the symlink fallback; got: ${JSON.stringify(lines)}`,
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('link: claude-code agent (dir→file via sourceFile) symlinks the inner agent.md', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  try {
    await install({
      tool: 'claude-code',
      agents: ['senior-architect'],
      target,
      sourceRoot: REPO_ROOT,
      link: true,
      logger,
    });
    const dest = path.join(toolDir(target, 'claude-code'), 'agents', 'senior-architect.md');
    const stat = fs.lstatSync(dest);
    assert.ok(stat.isSymbolicLink(), 'inner agent.md is symlinkable when no transform is needed');
    const resolved = fs.realpathSync(dest);
    const expected = fs.realpathSync(
      path.join(REPO_ROOT, 'agents', 'senior-architect', 'agent.md'),
    );
    assert.equal(resolved, expected);
  } finally {
    cleanupTmpProject(target);
  }
});

test('link: edits to the source flow through symlinks to the destination', async () => {
  const target = createTmpProject();
  const { logger } = recordingLogger();
  // Use a writable source so we can edit and confirm.
  const tmpSrc = createTmpProject('aitk-link-src-');
  try {
    for (const sub of ['skills', 'agents', 'commands', 'hooks', 'rules', 'config', 'manifest.json']) {
      const from = path.join(REPO_ROOT, sub);
      const to = path.join(tmpSrc, sub);
      if (fs.statSync(from).isDirectory()) fs.cpSync(from, to, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
    await install({
      tool: 'claude-code',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: tmpSrc,
      link: true,
      logger,
    });
    fs.appendFileSync(
      path.join(tmpSrc, 'skills', 'code-review-checklist', 'SKILL.md'),
      '\n<!-- edited live -->\n',
    );
    const body = fs.readFileSync(
      path.join(toolDir(target, 'claude-code'), 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    assert.match(body, /edited live/);
  } finally {
    cleanupTmpProject(tmpSrc);
    cleanupTmpProject(target);
  }
});

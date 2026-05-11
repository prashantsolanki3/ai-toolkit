// test/integration/mcp.test.js
//
// End-to-end install / update / remove behaviour for MCP server entries.
// MCP is the one asset type that doesn't drop a file at a predictable
// location — instead it merges a JSON entry into a tool-managed config
// file (.mcp.json, .cursor/mcp.json, .vscode/mcp.json, settings.json, ...).
// These tests cover the contract:
//
//   - install merges our entry under the right wrapper key, preserving
//     unrelated keys and pre-existing entries the user added themselves.
//   - the lockfile records enough state to detect drift later.
//   - install --force overwrites a destination entry that wasn't ours.
//   - update overwrites our entry when source changes; --force is needed
//     to overwrite a hand-edited destination entry.
//   - remove deletes only our entry; the user's entries survive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';
import { readJsonFile, writeJsonFile } from '../../src/lib/json-merge.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
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

test('install: mcp entry lands at .mcp.json for claude-code', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const mcpFile = path.join(target, '.mcp.json');
    const data = readJsonFile(mcpFile);
    assert.deepEqual(data.mcpServers.everything, {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });
    // Lockfile is still stored under the tool's workspace dir.
    const lock = JSON.parse(
      fs.readFileSync(path.join(toolDir(target, 'claude-code'), LOCKFILE_NAME), 'utf8'),
    );
    assert.ok(lock.assets.mcp.everything);
    assert.equal(lock.assets.mcp.everything.key, 'everything');
    assert.deepEqual(lock.assets.mcp.everything.wrapperPath, ['mcpServers']);
    assert.ok(lock.assets.mcp.everything.configFile.endsWith('.mcp.json'));
    assert.match(lock.assets.mcp.everything.valueSha, /^[a-f0-9]{64}$/);
    assert.match(lock.assets.mcp.everything.sourceSha, /^[a-f0-9]{64}$/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: mcp entry lands at .cursor/mcp.json for cursor', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'cursor',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const data = readJsonFile(path.join(target, '.cursor', 'mcp.json'));
    assert.deepEqual(data.mcpServers.everything.command, 'npx');
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: mcp entry uses servers (not mcpServers) wrapper for vscode-copilot', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'vscode-copilot',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const data = readJsonFile(path.join(target, '.vscode', 'mcp.json'));
    assert.ok(data.servers && data.servers.everything);
    assert.equal(data.mcpServers, undefined);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: mcp entry merges into settings.json under mcpServers for gemini-cli, preserving other keys', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    const settingsPath = path.join(target, '.gemini', 'settings.json');
    writeJsonFile(settingsPath, { theme: 'dark', mcpServers: { user: { command: 'echo' } } });
    await install({
      tool: 'gemini-cli',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const data = readJsonFile(settingsPath);
    assert.equal(data.theme, 'dark');
    assert.ok(data.mcpServers.user);
    assert.ok(data.mcpServers.everything);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: refuses to overwrite a pre-existing MCP entry without --force', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    const mcpFile = path.join(target, '.mcp.json');
    writeJsonFile(mcpFile, {
      mcpServers: { everything: { command: 'pre-existing-by-user' } },
    });
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const data = readJsonFile(mcpFile);
    // The user's entry survives, because we refused to overwrite.
    assert.equal(data.mcpServers.everything.command, 'pre-existing-by-user');
    assert.ok(lines.some(([level, m]) => level === 'warn' && /everything/.test(m) && /force/.test(m)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install --force: overwrites a pre-existing MCP entry', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    const mcpFile = path.join(target, '.mcp.json');
    writeJsonFile(mcpFile, {
      mcpServers: { everything: { command: 'pre-existing-by-user' } },
    });
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      force: true,
      logger,
    });
    const data = readJsonFile(mcpFile);
    assert.equal(data.mcpServers.everything.command, 'npx');
  } finally {
    cleanupTmpProject(target);
  }
});

test('install --dry-run: writes nothing for MCP', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      dryRun: true,
      logger,
    });
    assert.equal(fs.existsSync(path.join(target, '.mcp.json')), false);
    assert.ok(lines.some(([level]) => level === 'dryRun'));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: multi-tool default also merges MCP into per-tool files', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    // No --tool: install everywhere using preset that includes our MCP entry.
    await install({
      preset: 'skill-development',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    // Claude Code wrote .mcp.json
    assert.ok(readJsonFile(path.join(target, '.mcp.json')).mcpServers.everything);
    // Cursor wrote .cursor/mcp.json
    assert.ok(readJsonFile(path.join(target, '.cursor', 'mcp.json')).mcpServers.everything);
    // VS Code wrote .vscode/mcp.json under `servers`
    assert.ok(readJsonFile(path.join(target, '.vscode', 'mcp.json')).servers.everything);
  } finally {
    cleanupTmpProject(target);
  }
});

test('update: re-applies our entry when the source changes', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // Mutate the upstream source to a different config, leaving the rest alone.
    const sourceFile = path.join(REPO_ROOT, 'mcp', 'everything.json');
    const original = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    const mutated = { ...original, config: { command: 'updated-cmd', args: ['x'] } };
    fs.writeFileSync(sourceFile, JSON.stringify(mutated, null, 2));
    // Regenerate the manifest so the in-memory manifest the toolkit loads
    // reflects the new config. We do this through the manifest-generator
    // directly to avoid spawning a child process.
    const { generateManifest } = await import('../../src/lib/manifest-generator.js');
    fs.writeFileSync(
      path.join(REPO_ROOT, 'manifest.json'),
      JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
    );

    try {
      await update({
        tool: 'claude-code',
        target,
        sourceRoot: REPO_ROOT,
        logger,
      });

      const data = readJsonFile(path.join(target, '.mcp.json'));
      assert.equal(data.mcpServers.everything.command, 'updated-cmd');
    } finally {
      // Restore the source for any subsequent tests.
      fs.writeFileSync(sourceFile, JSON.stringify(original, null, 2));
      fs.writeFileSync(
        path.join(REPO_ROOT, 'manifest.json'),
        JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
      );
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('update: refuses to overwrite a hand-edited destination entry without --force', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // User hand-edits our MCP entry after install.
    const mcpFile = path.join(target, '.mcp.json');
    const data = readJsonFile(mcpFile);
    data.mcpServers.everything = { command: 'user-edited' };
    writeJsonFile(mcpFile, data);

    // Source also drifted upstream — to force update() to consider the entry.
    const sourceFile = path.join(REPO_ROOT, 'mcp', 'everything.json');
    const original = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    const mutated = { ...original, config: { command: 'new-from-source' } };
    fs.writeFileSync(sourceFile, JSON.stringify(mutated, null, 2));
    const { generateManifest } = await import('../../src/lib/manifest-generator.js');
    fs.writeFileSync(
      path.join(REPO_ROOT, 'manifest.json'),
      JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
    );

    try {
      await update({ tool: 'claude-code', target, sourceRoot: REPO_ROOT, logger });
      // The user's hand-edit is preserved; warning surfaced.
      const after = readJsonFile(mcpFile);
      assert.equal(after.mcpServers.everything.command, 'user-edited');
      assert.ok(lines.some(([level, m]) => level === 'warn' && /everything/.test(m) && /force/.test(m)));
    } finally {
      fs.writeFileSync(sourceFile, JSON.stringify(original, null, 2));
      fs.writeFileSync(
        path.join(REPO_ROOT, 'manifest.json'),
        JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
      );
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: deletes only our MCP entry — sibling user entries survive', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    // Seed a sibling entry the user added themselves.
    const mcpFile = path.join(target, '.mcp.json');
    writeJsonFile(mcpFile, { mcpServers: { hand_added: { command: 'echo' } } });

    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    await remove({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const after = readJsonFile(mcpFile);
    assert.equal(after.mcpServers.everything, undefined);
    assert.equal(after.mcpServers.hand_added.command, 'echo');
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove --all: tears down both file-copy assets and MCP entries', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      skills: ['api-endpoint-design'],
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    await remove({
      tool: 'claude-code',
      all: true,
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const installDir = toolDir(target, 'claude-code');
    assert.equal(fs.existsSync(path.join(installDir, 'skills', 'api-endpoint-design')), false);
    const after = readJsonFile(path.join(target, '.mcp.json'));
    // The .mcp.json file may or may not exist depending on whether other entries
    // were left — but our key must be gone.
    if (after) assert.equal(after.mcpServers?.everything, undefined);
  } finally {
    cleanupTmpProject(target);
  }
});

// ── env-var warnings ───────────────────────────────────────────────────

test('install: warns when an MCP entry references env vars that resolve to empty', async () => {
  // Add a one-off MCP entry with an env value that points at a guaranteed-unset variable.
  const tmpName = 'env-test-entry';
  const sourceFile = path.join(REPO_ROOT, 'mcp', `${tmpName}.json`);
  fs.writeFileSync(
    sourceFile,
    JSON.stringify(
      {
        description: 'env warning fixture',
        config: {
          command: 'node',
          env: {
            EMPTY_LITERAL: '',
            UNSET_REF: '${AI_TOOLKIT_TEST_DEFINITELY_UNSET_XYZZY}',
            HAS_DEFAULT: '${AI_TOOLKIT_TEST_DEFINITELY_UNSET_XYZZY:-fine}',
            OK: 'plain value',
          },
        },
      },
      null,
      2,
    ),
  );
  const { generateManifest } = await import('../../src/lib/manifest-generator.js');
  fs.writeFileSync(
    path.join(REPO_ROOT, 'manifest.json'),
    JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
  );

  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  delete process.env.AI_TOOLKIT_TEST_DEFINITELY_UNSET_XYZZY;
  try {
    await install({
      tool: 'claude-code',
      mcp: [tmpName],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const warned = lines.filter(([l]) => l === 'warn').map(([, m]) => m).join('\n');
    assert.match(warned, new RegExp(tmpName), 'expected a warning naming the MCP entry');
    assert.match(warned, /EMPTY_LITERAL/, 'expected EMPTY_LITERAL to be flagged');
    assert.match(warned, /UNSET_REF/, 'expected UNSET_REF to be flagged');
    assert.doesNotMatch(warned, /\bOK\b/, 'OK should not be flagged');
    assert.doesNotMatch(warned, /HAS_DEFAULT/, '${VAR:-default} pattern should not be flagged');

    // Install still succeeds — the warning is informational, not fatal.
    const data = readJsonFile(path.join(target, '.mcp.json'));
    assert.ok(data.mcpServers[tmpName], 'install should still write the entry');
  } finally {
    fs.unlinkSync(sourceFile);
    fs.writeFileSync(
      path.join(REPO_ROOT, 'manifest.json'),
      JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
    );
    cleanupTmpProject(target);
  }
});

// ── update --scope ─────────────────────────────────────────────────────

test('update --scope: defaults to workspace, matching install', async () => {
  // Install with the default workspace scope, then update without --scope
  // and verify it operates on the workspace-scoped destination.
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    // Bump the source so update has a reason to run.
    const sourceFile = path.join(REPO_ROOT, 'mcp', 'everything.json');
    const original = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    const mutated = { ...original, config: { command: 'workspace-updated', args: [] } };
    fs.writeFileSync(sourceFile, JSON.stringify(mutated, null, 2));
    const { generateManifest } = await import('../../src/lib/manifest-generator.js');
    fs.writeFileSync(
      path.join(REPO_ROOT, 'manifest.json'),
      JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
    );

    try {
      await update({
        tool: 'claude-code',
        target,
        sourceRoot: REPO_ROOT,
        logger,
      });
      const data = readJsonFile(path.join(target, '.mcp.json'));
      assert.equal(data.mcpServers.everything.command, 'workspace-updated');
    } finally {
      fs.writeFileSync(sourceFile, JSON.stringify(original, null, 2));
      fs.writeFileSync(
        path.join(REPO_ROOT, 'manifest.json'),
        JSON.stringify(generateManifest(REPO_ROOT), null, 2) + '\n',
      );
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('update --scope global: warns and skips a tool whose defaultTarget.global is null', async () => {
  // vscode-copilot has defaultTarget.global = null (workspace-only).
  // Install workspace-scoped first to land a lockfile, then ask update to
  // run at global scope. We expect a warning, no throw, and no work done.
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'vscode-copilot',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    await update({
      tool: 'vscode-copilot',
      scope: 'global',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    assert.ok(
      lines.some(([level, m]) => level === 'warn' && /global/.test(m) && /(skip|not support)/i.test(m)),
      'expected a warning explaining global scope is not supported for this tool',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: deletes the MCP config file when its only content is our (now empty) wrapper', async () => {
  // For dedicated MCP files (.mcp.json, .cursor/mcp.json, .vscode/mcp.json),
  // removing our last entry should also remove the now-pointless wrapper
  // file — otherwise `cleanupEmptyDirs` can never reach the tool root.
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    assert.ok(fs.existsSync(path.join(target, '.mcp.json')));

    await remove({
      tool: 'claude-code',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    assert.equal(
      fs.existsSync(path.join(target, '.mcp.json')),
      false,
      '.mcp.json should be deleted when only our (now empty) wrapper would remain',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: leaves the MCP config file alone when other keys remain (user data preserved)', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    // User has another setting in the same file (gemini-cli's settings.json
    // is the realistic case — a shared file that also holds non-MCP keys).
    const settingsPath = path.join(target, '.gemini', 'settings.json');
    writeJsonFile(settingsPath, {
      theme: 'dark',
      mcpServers: { user_one: { command: 'echo' } },
    });
    await install({
      tool: 'gemini-cli',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    await remove({
      tool: 'gemini-cli',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const data = readJsonFile(settingsPath);
    // The user's unrelated key survives, and their MCP entry survives.
    assert.equal(data.theme, 'dark');
    assert.deepEqual(data.mcpServers.user_one, { command: 'echo' });
    // Our key is gone.
    assert.equal(data.mcpServers.everything, undefined);
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: cleans up an empty MCP-only directory when it sits outside the tool target (vscode .vscode/)', async () => {
  // VS Code Copilot has tool target .github/ but its MCP file is at
  // .vscode/mcp.json. If we delete the file but leave the dir behind,
  // the project root keeps an empty .vscode/ as litter. This test pins
  // that the dir gets cleaned up too.
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'vscode-copilot',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    assert.ok(fs.existsSync(path.join(target, '.vscode', 'mcp.json')));

    await remove({
      tool: 'vscode-copilot',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    assert.equal(
      fs.existsSync(path.join(target, '.vscode')),
      false,
      '.vscode/ should be cleaned up after MCP file deletion',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: tools whose mcpConfig.workspace is null (antigravity, copilot-cli) skip with a warning', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'antigravity',
      mcp: ['everything'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    // No file under target was written.
    assert.equal(fs.existsSync(path.join(target, '.agent', 'skills', 'everything.json')), false);
    // A warning surfaced explaining the scope mismatch.
    assert.ok(
      lines.some(([level, m]) => level === 'warn' && /mcp/.test(m) && /workspace/.test(m)),
      'expected a warning explaining workspace MCP is not supported',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

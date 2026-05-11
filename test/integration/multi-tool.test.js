import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTools, getAssetDestination, resolveTargetPath } from '../../src/lib/tools.js';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  return {
    info() {},
    success() {},
    warn() {},
    error() {},
    dryRun() {},
    verbose() {},
  };
}

const tools = loadTools(path.join(REPO_ROOT, 'config'));
const TOOL_NAMES = Object.keys(tools.tools);
const UNIVERSAL_SKILL = 'code-review-checklist';

for (const toolName of TOOL_NAMES) {
  const tool = tools.tools[toolName];

  test(`matrix: ${toolName} – full install/update/remove cycle for a skill`, async () => {
    const projectRoot = createTmpProject();
    try {
      const installDir = resolveTargetPath(tool, 'workspace', projectRoot);
      const expectedDest = getAssetDestination(tool, installDir, 'skills', UNIVERSAL_SKILL);
      const destFormat = tool.assetFormats.skills;

      // For directory-format destinations the SKILL.md lives inside the dir;
      // for file-format destinations the destination IS the file.
      const expectedFile =
        destFormat.type === 'directory' ? path.join(expectedDest, 'SKILL.md') : expectedDest;

      await install({
        tool: toolName,
        skills: [UNIVERSAL_SKILL],
        target: projectRoot,
        sourceRoot: REPO_ROOT,
        logger: silentLogger(),
      });

      assert.ok(
        fs.existsSync(expectedFile),
        `expected skill content at tool-specific destination ${expectedFile}`,
      );

      const updateResult = await update({
        target: projectRoot,
        tool: toolName,
        sourceRoot: REPO_ROOT,
        logger: silentLogger(),
      });
      assert.deepEqual(updateResult.updated, []);

      await remove({
        target: projectRoot,
        tool: toolName,
        sourceRoot: REPO_ROOT,
        skills: [UNIVERSAL_SKILL],
        logger: silentLogger(),
      });
      assert.equal(fs.existsSync(expectedDest), false);
    } finally {
      cleanupTmpProject(projectRoot);
    }
  });

  test(`matrix: ${toolName} – workspace defaultTarget is non-empty`, () => {
    const workspaceDefault = tool.defaultTarget && tool.defaultTarget.workspace;
    assert.ok(workspaceDefault, `tool "${toolName}" must declare a workspace defaultTarget`);
  });

  test(`matrix: ${toolName} – every supported asset type has a path and format defined`, () => {
    for (const t of tool.supportedAssets) {
      // MCP doesn't use the file-copy assetPaths/assetFormats machinery —
      // it merges JSON into a fixed file declared via mcpConfig instead.
      if (t === 'mcp') {
        assert.ok(
          tool.mcpConfig && tool.mcpConfig.file && Array.isArray(tool.mcpConfig.wrapperPath),
          `tool "${toolName}" supports mcp but is missing a complete mcpConfig {wrapperPath, file}`,
        );
        continue;
      }
      assert.ok(
        Object.prototype.hasOwnProperty.call(tool.assetPaths, t),
        `tool "${toolName}" supports ${t} but is missing assetPaths.${t}`,
      );
      assert.ok(tool.assetFormats[t], `tool "${toolName}" missing assetFormats.${t}`);
    }
  });

  test(`matrix: ${toolName} – resolveTargetPath workspace works (no override)`, () => {
    const resolved = resolveTargetPath(tool, 'workspace', null);
    assert.ok(typeof resolved === 'string' && resolved.length > 0);
  });
}

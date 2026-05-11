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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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
    const target = createTmpProject();
    try {
      // Some tools (e.g. cursor) have null defaultTarget.global. The matrix
      // always passes an explicit --target so this is not relevant to the test.
      const expectedDest = getAssetDestination(tool, target, 'skills', UNIVERSAL_SKILL);

      await install({
        tool: toolName,
        skills: [UNIVERSAL_SKILL],
        target,
        sourceRoot: REPO_ROOT,
        logger: silentLogger(),
      });

      assert.ok(
        fs.existsSync(path.join(expectedDest, 'SKILL.md')),
        `expected SKILL.md at tool-specific destination ${expectedDest}`,
      );

      const updateResult = await update({
        target,
        sourceRoot: REPO_ROOT,
        logger: silentLogger(),
      });
      assert.deepEqual(updateResult.updated, []);

      await remove({
        target,
        sourceRoot: REPO_ROOT,
        skills: [UNIVERSAL_SKILL],
        logger: silentLogger(),
      });
      assert.equal(fs.existsSync(expectedDest), false);
    } finally {
      cleanupTmpProject(target);
    }
  });

  test(`matrix: ${toolName} – workspace defaultTarget is non-empty`, () => {
    const workspaceDefault = tool.defaultTarget && tool.defaultTarget.workspace;
    assert.ok(workspaceDefault, `tool "${toolName}" must declare a workspace defaultTarget`);
  });

  test(`matrix: ${toolName} – every supported asset type has a path and format defined`, () => {
    for (const t of tool.supportedAssets) {
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

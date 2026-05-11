// test/integration/asset-tool-matrix.test.js
//
// Dynamic per-(asset × tool) install matrix. Loads the real manifest +
// tool config at test-load time and emits one test for every compatible
// pair. "Compatible" means:
//   - the tool's supportedAssets includes the asset's type
//   - the asset's `tools` allowlist (if set) includes the tool
//   - the tool has a workspace defaultTarget (no install possible otherwise)
//
// Adding a new asset OR a new tool to config/tools.json automatically
// expands the matrix. This is the "did anything regress for the real
// shipped content?" gate — orthogonal to the legacy-fixture tests that
// pin specific behaviour.
//
// What we assert per pair:
//   - install lands a file at the destination resolveTargetPath +
//     getAssetDestination compute. (No content assertions — that lives
//     in per-tool-paths.test.js, which we don't want to duplicate.)
//   - the lockfile records the asset.
//   - remove tears it down.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import {
  loadTools,
  getAssetDestination,
  resolveTargetPath,
} from '../../src/lib/tools.js';
import { read as readLockfile } from '../../src/lib/lockfile.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
const tools = loadTools(path.join(REPO_ROOT, 'config')).tools;

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

function isCompatible({ toolName, tool, type, asset }) {
  if (!tool.supportedAssets?.includes(type)) return false;
  if (asset.tools && !asset.tools.includes(toolName)) return false;
  if (!tool.defaultTarget?.workspace) return false;
  return true;
}

let pairCount = 0;

for (const type of ASSET_TYPES) {
  const assets = manifest[type] || {};
  for (const [name, asset] of Object.entries(assets)) {
    for (const [toolName, tool] of Object.entries(tools)) {
      if (!isCompatible({ toolName, tool, type, asset })) continue;
      pairCount += 1;

      test(`matrix: ${toolName}/${type}/${name} installs + removes`, async () => {
        const target = createTmpProject();
        try {
          await install({
            tool: toolName,
            [type]: [name],
            target,
            sourceRoot: REPO_ROOT,
            logger: silentLogger(),
          });

          // Where the install should have landed.
          const installDir = resolveTargetPath(tool, 'workspace', target);
          const destFormat = tool.assetFormats[type];
          const destPath = getAssetDestination(tool, installDir, type, name);
          const expected =
            destFormat.type === 'directory' ? path.join(destPath, destFormat.filename) : destPath;
          assert.ok(
            fs.existsSync(expected),
            `expected ${type}/${name} at ${expected} for tool ${toolName}`,
          );

          // Lockfile recorded the asset.
          const lock = readLockfile(installDir);
          assert.ok(lock?.assets?.[type]?.[name], `lockfile should record ${type}/${name}`);

          // Remove tears it down.
          await remove({
            tool: toolName,
            [type]: [name],
            target,
            sourceRoot: REPO_ROOT,
            logger: silentLogger(),
          });
          assert.equal(
            fs.existsSync(destPath),
            false,
            `${destPath} should not exist after remove`,
          );
        } finally {
          cleanupTmpProject(target);
        }
      });
    }
  }
}

// One meta-test that fails fast if the matrix is empty — would mean the
// repo ships zero installable assets or no tools support any of them.
test('matrix: at least one (asset, tool) pair is compatible', () => {
  assert.ok(
    pairCount > 0,
    'no (asset, tool) pairs were emitted — every shipped asset is unreachable from every shipped tool',
  );
});

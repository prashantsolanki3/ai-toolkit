// test/integration/asset-coverage.test.js
//
// Dynamic per-asset coverage. At test-load time we read the real
// manifest.json + config/tools.json and emit one or more `test()` calls
// per asset shipped by the repo. The effect: add a new skill/agent/
// command/hook/rule, run `make register`, and these tests automatically
// run against it — no test code changes.
//
// Two checks per asset:
//   1. Source layout exists where the manifest expects it.
//   2. The asset installs and removes cleanly against *some* tool that
//      supports the asset's type AND is allowed by the asset's `tools`
//      frontmatter allowlist (if set).
//
// If you've added a new asset and one of these fails, the asset has a
// structural problem the manifest didn't catch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import { loadTools } from '../../src/lib/tools.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
const tools = loadTools(path.join(REPO_ROOT, 'config')).tools;

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

// Where each asset type lives in the source tree.
const SOURCE_LAYOUT = {
  skills: { kind: 'directory', entry: 'SKILL.md' },
  agents: { kind: 'directory', entry: 'agent.md' },
  commands: { kind: 'file', ext: '.md' },
  hooks: { kind: 'file', ext: '.sh' },
  rules: { kind: 'file', ext: '.mdc' },
};

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

// Find a tool that can install this asset:
//   - tool.supportedAssets includes this asset type
//   - the asset's `tools` allowlist (if set) includes this tool name
//   - the tool's workspace defaultTarget is set (so we can install at all)
function pickSupportingTool(type, asset) {
  for (const [toolName, tool] of Object.entries(tools)) {
    if (!tool.supportedAssets?.includes(type)) continue;
    if (asset.tools && !asset.tools.includes(toolName)) continue;
    if (!tool.defaultTarget?.workspace) continue;
    return toolName;
  }
  return null;
}

for (const type of ASSET_TYPES) {
  const assets = manifest[type] || {};
  if (Object.keys(assets).length === 0) continue;

  for (const [name, asset] of Object.entries(assets)) {
    const layout = SOURCE_LAYOUT[type];

    test(`asset-coverage: ${type}/${name} — source on disk matches layout`, () => {
      if (layout.kind === 'directory') {
        const dir = path.join(REPO_ROOT, type, name);
        const entry = path.join(dir, layout.entry);
        assert.ok(
          fs.statSync(dir).isDirectory(),
          `${dir} must exist as a directory (per ${type} layout)`,
        );
        assert.ok(
          fs.existsSync(entry),
          `${entry} must exist (per ${type} layout's entry file)`,
        );
      } else {
        const file = path.join(REPO_ROOT, type, `${name}${layout.ext}`);
        assert.ok(
          fs.existsSync(file) && fs.statSync(file).isFile(),
          `${file} must exist as a file (per ${type} layout)`,
        );
      }
    });

    test(`asset-coverage: ${type}/${name} — installs + removes for a supporting tool`, async () => {
      const supportingTool = pickSupportingTool(type, asset);
      if (!supportingTool) {
        // Asset can never be installed (its `tools` allowlist excludes every
        // configured tool, or no tool supports its type). That's worth
        // surfacing as a real failure — the asset is dead weight.
        assert.fail(
          `no tool in config/tools.json supports ${type} that is also allowed by ${type}/${name}'s tools allowlist`,
        );
      }

      const target = createTmpProject();
      try {
        const result = await install({
          tool: supportingTool,
          [type]: [name],
          target,
          sourceRoot: REPO_ROOT,
          logger: silentLogger(),
        });
        assert.ok(result.lockfile, `install for ${supportingTool} should produce a lockfile`);

        await remove({
          tool: supportingTool,
          [type]: [name],
          target,
          sourceRoot: REPO_ROOT,
          logger: silentLogger(),
        });
        // remove() returning without throwing is enough; deeper assertions
        // live in remove.test.js. We just want to know the round-trip works.
      } finally {
        cleanupTmpProject(target);
      }
    });

    // If the asset is a multi-folder skill or agent that ships an eval.json,
    // assert it's parseable JSON. (Schema-level checks live in
    // test/unit/eval-format.test.js.)
    if (layout.kind === 'directory') {
      const evalPath = path.join(REPO_ROOT, type, name, 'eval.json');
      if (fs.existsSync(evalPath)) {
        test(`asset-coverage: ${type}/${name} — eval.json parses`, () => {
          const raw = fs.readFileSync(evalPath, 'utf8');
          assert.doesNotThrow(() => JSON.parse(raw), `${evalPath} must be valid JSON`);
        });
      }
    }
  }
}

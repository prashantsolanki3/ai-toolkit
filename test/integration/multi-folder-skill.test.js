import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

const MULTI_FOLDER_SKILL = 'comprehensive-review';
const EXPECTED_FILES = [
  'SKILL.md',
  'eval.json',
  'scripts/precheck.sh',
  'references/style-guide.md',
];

test('claude-code (dir destination): multi-folder skill copies the entire tree', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      skills: [MULTI_FOLDER_SKILL],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    for (const rel of EXPECTED_FILES) {
      assert.ok(
        fs.existsSync(path.join(target, 'skills', MULTI_FOLDER_SKILL, rel)),
        `missing ${rel} after install`,
      );
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('antigravity (dir destination, root-level skills): multi-folder skill round-trips', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'antigravity',
      skills: [MULTI_FOLDER_SKILL],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    for (const rel of EXPECTED_FILES) {
      assert.ok(fs.existsSync(path.join(target, MULTI_FOLDER_SKILL, rel)));
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor (file destination): multi-folder skill flattens to a single .mdc', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      skills: [MULTI_FOLDER_SKILL],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    // Only the SKILL.md should be extracted into the .mdc; the sub-folders
    // (scripts/, references/) and the eval.json have no equivalent in
    // Cursor's rule model, so they're intentionally not carried over.
    assert.ok(
      fs.existsSync(path.join(target, 'rules', `${MULTI_FOLDER_SKILL}.mdc`)),
      `missing flattened .mdc`,
    );
    assert.ok(!fs.existsSync(path.join(target, 'rules', 'scripts')));
    assert.ok(!fs.existsSync(path.join(target, 'rules', 'references')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('update: changes to nested files in a multi-folder skill propagate', async () => {
  const target = createTmpProject();
  // Make a writable copy of the source so we can mutate one of the
  // sub-folder files and observe the update.
  const tmpSrc = createTmpProject('aitk-src-mf-');
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
      skills: [MULTI_FOLDER_SKILL],
      target,
      sourceRoot: tmpSrc,
      logger: silentLogger(),
    });
    const nestedFile = path.join(tmpSrc, 'skills', MULTI_FOLDER_SKILL, 'references', 'style-guide.md');
    fs.appendFileSync(nestedFile, '\n<!-- upstream edit -->\n');

    const result = await update({ target, sourceRoot: tmpSrc, logger: silentLogger() });
    assert.ok(result.updated.some((u) => u.name === MULTI_FOLDER_SKILL));

    const installedNested = path.join(target, 'skills', MULTI_FOLDER_SKILL, 'references', 'style-guide.md');
    const body = fs.readFileSync(installedNested, 'utf8');
    assert.match(body, /upstream edit/);
  } finally {
    cleanupTmpProject(tmpSrc);
    cleanupTmpProject(target);
  }
});

test('remove: tears down the entire multi-folder skill directory', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      skills: [MULTI_FOLDER_SKILL],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    await remove({
      target,
      sourceRoot: REPO_ROOT,
      skills: [MULTI_FOLDER_SKILL],
      logger: silentLogger(),
    });
    assert.equal(fs.existsSync(path.join(target, 'skills', MULTI_FOLDER_SKILL)), false);
  } finally {
    cleanupTmpProject(target);
  }
});

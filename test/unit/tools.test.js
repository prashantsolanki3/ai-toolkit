import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  loadTools,
  getTool,
  resolveTargetPath,
  getAssetDestination,
  supportsAsset,
} from '../../src/lib/tools.js';
import { createFakeSource } from '../helpers/fake-source.js';
import { cleanupTmpProject } from '../helpers/tmp-project.js';

const validSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['version', 'tools'],
  properties: {
    version: { type: 'string' },
    tools: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['displayName', 'defaultTarget', 'assetPaths', 'assetFormats', 'supportedAssets'],
        properties: {
          displayName: { type: 'string' },
          defaultTarget: {
            type: 'object',
            properties: {
              global: { type: ['string', 'null'] },
              workspace: { type: ['string', 'null'] },
            },
          },
          assetPaths: { type: 'object' },
          assetFormats: { type: 'object' },
          supportedAssets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const validConfig = {
  version: '1.0',
  tools: {
    'demo-tool': {
      displayName: 'Demo Tool',
      defaultTarget: { global: '~/.demo', workspace: '.demo' },
      assetPaths: { skills: 'skills', commands: 'cmds' },
      assetFormats: {
        skills: { filename: 'SKILL.md', type: 'directory' },
        commands: { filename: '{name}.md', type: 'file' },
      },
      supportedAssets: ['skills', 'commands'],
    },
  },
};

test('loadTools() returns parsed config', () => {
  const src = createFakeSource({ tools: validConfig, toolsSchema: validSchema });
  try {
    const config = loadTools(path.join(src, 'config'));
    assert.equal(config.version, '1.0');
    assert.ok(config.tools['demo-tool']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('loadTools() throws on malformed config (schema violation)', () => {
  const bad = { version: '1.0', tools: { broken: { displayName: 'x' } } };
  const src = createFakeSource({ tools: bad, toolsSchema: validSchema });
  try {
    assert.throws(() => loadTools(path.join(src, 'config')), /schema|valid/i);
  } finally {
    cleanupTmpProject(src);
  }
});

test('loadTools() throws when file missing', () => {
  assert.throws(() => loadTools('/nonexistent-dir-aitoolkit-test'), /not found|ENOENT/i);
});

test('getTool() returns the tool definition', () => {
  const config = JSON.parse(JSON.stringify(validConfig));
  const tool = getTool(config, 'demo-tool');
  assert.equal(tool.displayName, 'Demo Tool');
});

test('getTool() throws with helpful error listing available tools', () => {
  const config = JSON.parse(JSON.stringify(validConfig));
  assert.throws(
    () => getTool(config, 'unknown-tool'),
    (err) => /unknown-tool/.test(err.message) && /demo-tool/.test(err.message),
  );
});

test('resolveTargetPath() prefers override', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'workspace', '/custom/path');
  assert.equal(resolved, '/custom/path');
});

test('resolveTargetPath() falls back to defaultTarget[scope]', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'workspace', null);
  assert.equal(resolved, '.demo');
});

test('resolveTargetPath() expands ~ to home dir', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'global', null);
  assert.ok(resolved.endsWith('.demo'));
  assert.ok(!resolved.startsWith('~'));
});

test('resolveTargetPath() throws when scope has null default and no override', () => {
  const tool = {
    ...validConfig.tools['demo-tool'],
    defaultTarget: { global: null, workspace: '.demo' },
  };
  assert.throws(() => resolveTargetPath(tool, 'global', null), /global|not supported|null/i);
});

test('getAssetDestination() returns directory path for directory-type assets', () => {
  const tool = validConfig.tools['demo-tool'];
  const dest = getAssetDestination(tool, '/target', 'skills', 'my-skill');
  assert.equal(dest, path.join('/target', 'skills', 'my-skill'));
});

test('getAssetDestination() returns file path for file-type assets with name template', () => {
  const tool = validConfig.tools['demo-tool'];
  const dest = getAssetDestination(tool, '/target', 'commands', 'do-thing');
  assert.equal(dest, path.join('/target', 'cmds', 'do-thing.md'));
});

test('getAssetDestination() throws when tool does not support asset type', () => {
  const tool = validConfig.tools['demo-tool'];
  assert.throws(
    () => getAssetDestination(tool, '/target', 'agents', 'my-agent'),
    /agents|not support/i,
  );
});

test('supportsAsset() returns true for supported assets', () => {
  const tool = validConfig.tools['demo-tool'];
  assert.equal(supportsAsset(tool, 'skills'), true);
  assert.equal(supportsAsset(tool, 'commands'), true);
});

test('supportsAsset() returns false for unsupported assets', () => {
  const tool = validConfig.tools['demo-tool'];
  assert.equal(supportsAsset(tool, 'agents'), false);
  assert.equal(supportsAsset(tool, 'hooks'), false);
});

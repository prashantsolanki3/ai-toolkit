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
  findInstalledTools,
  getMcpConfigPath,
  getMcpWrapperPath,
} from '../../src/lib/tools.js';
import { createFakeSource } from '../helpers/fake-source.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

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

test('resolveTargetPath() joins workspace subdir under the project root', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'workspace', '/repos/project');
  assert.equal(resolved, path.resolve('/repos/project', '.demo'));
});

test('resolveTargetPath() defaults projectRoot to CWD when no override', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'workspace', null);
  assert.equal(resolved, path.resolve(process.cwd(), '.demo'));
});

test('resolveTargetPath() expands ~ for global scope and ignores projectRoot', () => {
  const tool = validConfig.tools['demo-tool'];
  const resolved = resolveTargetPath(tool, 'global', '/repos/project');
  assert.ok(resolved.endsWith('.demo'));
  assert.ok(!resolved.startsWith('~'));
  // global is absolute (~/.demo expanded) — project root must NOT prefix it
  assert.ok(!resolved.startsWith('/repos/project'));
});

test('resolveTargetPath() throws when scope has null default', () => {
  const tool = {
    ...validConfig.tools['demo-tool'],
    defaultTarget: { global: null, workspace: '.demo' },
  };
  assert.throws(() => resolveTargetPath(tool, 'global', null), /global|not support/i);
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

test('findInstalledTools() returns tools whose workspace subdir has a lockfile', () => {
  const dir = createTmpProject();
  try {
    // pretend project has a .demo subdir with a lockfile
    fs.mkdirSync(path.join(dir, '.demo'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.demo', '.ai-toolkit-lock.json'),
      JSON.stringify({ version: '1.0', tool: 'demo-tool', assets: {} }),
    );
    const config = {
      version: '1.0',
      tools: {
        'demo-tool': validConfig.tools['demo-tool'],
        'other-tool': {
          ...validConfig.tools['demo-tool'],
          defaultTarget: { global: null, workspace: '.other' },
        },
      },
    };
    const found = findInstalledTools(config, dir);
    assert.equal(found.length, 1);
    assert.equal(found[0].tool, 'demo-tool');
    assert.equal(found[0].dir, path.resolve(dir, '.demo'));
  } finally {
    cleanupTmpProject(dir);
  }
});

test('findInstalledTools() returns empty when no tool dirs have lockfiles', () => {
  const dir = createTmpProject();
  try {
    const config = { version: '1.0', tools: { 'demo-tool': validConfig.tools['demo-tool'] } };
    assert.deepEqual(findInstalledTools(config, dir), []);
  } finally {
    cleanupTmpProject(dir);
  }
});

// ── MCP config path resolution ─────────────────────────────────────────

const mcpTool = {
  displayName: 'MCP Demo',
  defaultTarget: { global: '~/.demo', workspace: '.demo' },
  assetPaths: {},
  assetFormats: {},
  supportedAssets: ['mcp'],
  mcpConfig: {
    wrapperPath: ['mcpServers'],
    file: {
      workspace: '.demo/mcp.json',
      global: '~/.demo/mcp.json',
    },
  },
};

test('getMcpConfigPath() resolves the workspace file relative to projectRoot', () => {
  const p = getMcpConfigPath(mcpTool, 'workspace', '/repos/project');
  assert.equal(p, path.resolve('/repos/project', '.demo/mcp.json'));
});

test('getMcpConfigPath() resolves the global file with ~ expansion, ignoring projectRoot', () => {
  const p = getMcpConfigPath(mcpTool, 'global', '/repos/project');
  assert.ok(path.isAbsolute(p));
  assert.ok(!p.startsWith('~'));
  assert.ok(!p.startsWith('/repos/project'));
  assert.ok(p.endsWith(path.join('.demo', 'mcp.json')));
});

test('getMcpConfigPath() defaults projectRoot to CWD when not provided', () => {
  const p = getMcpConfigPath(mcpTool, 'workspace', null);
  assert.equal(p, path.resolve(process.cwd(), '.demo/mcp.json'));
});

test('getMcpConfigPath() throws when MCP is not supported', () => {
  const bare = {
    ...mcpTool,
    supportedAssets: ['skills'],
    mcpConfig: undefined,
  };
  assert.throws(() => getMcpConfigPath(bare, 'workspace', '/x'), /mcp|not support/i);
});

test('getMcpConfigPath() throws when the requested scope is null', () => {
  const workspaceOnly = {
    ...mcpTool,
    mcpConfig: {
      wrapperPath: ['mcpServers'],
      file: { workspace: '.demo/mcp.json', global: null },
    },
  };
  assert.throws(() => getMcpConfigPath(workspaceOnly, 'global', '/x'), /global|not support/i);
});

test('getMcpWrapperPath() returns the configured wrapper key list', () => {
  assert.deepEqual(getMcpWrapperPath(mcpTool), ['mcpServers']);
});

test('getMcpWrapperPath() throws when MCP is not supported', () => {
  const bare = { ...mcpTool, supportedAssets: ['skills'], mcpConfig: undefined };
  assert.throws(() => getMcpWrapperPath(bare), /mcp|not support/i);
});

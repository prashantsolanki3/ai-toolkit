import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstallTargets } from '../../src/lib/resolver.js';

const manifest = {
  version: '1.0',
  skills: {
    'api-endpoint-design': {},
    'database-migration-safety': {},
    'code-review-checklist': {},
  },
  agents: { 'senior-architect': {} },
  commands: { 'summarize-diff': {} },
  hooks: { 'pre-commit-lint': {} },
  presets: {
    'backend-essentials': {
      skills: ['api-endpoint-design', 'code-review-checklist'],
      agents: ['senior-architect'],
      commands: ['summarize-diff'],
      hooks: [],
    },
  },
};

const fullTool = {
  displayName: 'X',
  defaultTarget: { workspace: '.x', global: '~/.x' },
  assetPaths: { skills: 's', agents: 'a', commands: 'c', hooks: 'h' },
  assetFormats: {
    skills: { filename: 'SKILL.md', type: 'directory' },
    agents: { filename: 'agent.md', type: 'directory' },
    commands: { filename: '{name}.md', type: 'file' },
    hooks: { filename: '{name}.sh', type: 'file' },
  },
  supportedAssets: ['skills', 'agents', 'commands', 'hooks'],
};

const skillsOnlyTool = {
  ...fullTool,
  supportedAssets: ['skills'],
};

test('resolveInstallTargets() expands preset into asset lists', () => {
  const result = resolveInstallTargets({ preset: 'backend-essentials' }, manifest, fullTool);
  assert.deepEqual(result.skills.sort(), ['api-endpoint-design', 'code-review-checklist']);
  assert.deepEqual(result.agents, ['senior-architect']);
  assert.deepEqual(result.commands, ['summarize-diff']);
  assert.deepEqual(result.hooks, []);
  assert.deepEqual(result.warnings, []);
});

test('resolveInstallTargets() merges preset with explicit flags', () => {
  const result = resolveInstallTargets(
    { preset: 'backend-essentials', skills: ['database-migration-safety'] },
    manifest,
    fullTool,
  );
  assert.ok(result.skills.includes('api-endpoint-design'));
  assert.ok(result.skills.includes('code-review-checklist'));
  assert.ok(result.skills.includes('database-migration-safety'));
});

test('resolveInstallTargets() dedups overlapping selections', () => {
  const result = resolveInstallTargets(
    { preset: 'backend-essentials', skills: ['api-endpoint-design'] },
    manifest,
    fullTool,
  );
  const apiCount = result.skills.filter((s) => s === 'api-endpoint-design').length;
  assert.equal(apiCount, 1);
});

test('resolveInstallTargets() works without a preset', () => {
  const result = resolveInstallTargets(
    { skills: ['api-endpoint-design'], commands: ['summarize-diff'] },
    manifest,
    fullTool,
  );
  assert.deepEqual(result.skills, ['api-endpoint-design']);
  assert.deepEqual(result.commands, ['summarize-diff']);
});

test('resolveInstallTargets() drops asset types unsupported by the tool with warnings', () => {
  const result = resolveInstallTargets(
    { preset: 'backend-essentials' },
    manifest,
    skillsOnlyTool,
  );
  assert.deepEqual(result.skills.sort(), ['api-endpoint-design', 'code-review-checklist']);
  assert.deepEqual(result.agents, []);
  assert.deepEqual(result.commands, []);
  assert.ok(result.warnings.length >= 2);
  assert.ok(result.warnings.some((w) => /agents/.test(w) && /support/.test(w)));
  assert.ok(result.warnings.some((w) => /commands/.test(w) && /support/.test(w)));
});

test('resolveInstallTargets() throws on unknown asset references', () => {
  assert.throws(
    () => resolveInstallTargets({ skills: ['nonexistent'] }, manifest, fullTool),
    /nonexistent/,
  );
});

test('resolveInstallTargets() throws on unknown preset', () => {
  assert.throws(
    () => resolveInstallTargets({ preset: 'no-such' }, manifest, fullTool),
    /no-such/,
  );
});

test('resolveInstallTargets() drops assets whose tools filter excludes the current tool', () => {
  const m = {
    ...manifest,
    skills: {
      ...manifest.skills,
      'claude-only': { tools: ['claude-code'] },
    },
  };
  const toolNamed = { ...fullTool, name: 'cursor' };
  const result = resolveInstallTargets(
    { skills: ['claude-only', 'api-endpoint-design'] },
    m,
    toolNamed,
    { toolName: 'cursor' },
  );
  assert.ok(!result.skills.includes('claude-only'));
  assert.ok(result.skills.includes('api-endpoint-design'));
  assert.ok(result.warnings.some((w) => /claude-only/.test(w) && /cursor/.test(w)));
});

test('resolveInstallTargets() keeps assets whose tools filter includes the current tool', () => {
  const m = {
    ...manifest,
    skills: {
      'multi-tool': { tools: ['claude-code', 'cursor'] },
    },
  };
  const result = resolveInstallTargets(
    { skills: ['multi-tool'] },
    m,
    fullTool,
    { toolName: 'cursor' },
  );
  assert.deepEqual(result.skills, ['multi-tool']);
});

test('resolveInstallTargets() keeps assets that omit tools (treated as universal)', () => {
  const m = {
    ...manifest,
    skills: { 'universal': {} },
  };
  const result = resolveInstallTargets(
    { skills: ['universal'] },
    m,
    fullTool,
    { toolName: 'cursor' },
  );
  assert.deepEqual(result.skills, ['universal']);
});

// ── MCP awareness ──────────────────────────────────────────────────────

const mcpManifest = {
  ...manifest,
  mcp: { everything: { description: 'demo' }, 'claude-only-mcp': { tools: ['claude-code'] } },
  presets: {
    ...manifest.presets,
    'with-mcp': { skills: [], agents: [], commands: [], hooks: [], rules: [], mcp: ['everything'] },
  },
};

const mcpTool = {
  ...fullTool,
  supportedAssets: [...fullTool.supportedAssets, 'mcp'],
};

test('resolveInstallTargets() includes the mcp bucket', () => {
  const result = resolveInstallTargets({ preset: 'with-mcp' }, mcpManifest, mcpTool);
  assert.deepEqual(result.mcp, ['everything']);
});

test('resolveInstallTargets() merges explicit --mcp flag with preset', () => {
  const m = {
    ...mcpManifest,
    mcp: { ...mcpManifest.mcp, extra: { description: 'extra' } },
  };
  const result = resolveInstallTargets(
    { preset: 'with-mcp', mcp: ['extra'] },
    m,
    mcpTool,
  );
  assert.deepEqual(result.mcp.sort(), ['everything', 'extra']);
});

test('resolveInstallTargets() drops mcp entries when the tool does not support mcp, with a warning', () => {
  const result = resolveInstallTargets({ mcp: ['everything'] }, mcpManifest, fullTool);
  assert.deepEqual(result.mcp, []);
  assert.ok(result.warnings.some((w) => /mcp/.test(w) && /support/.test(w)));
});

test('resolveInstallTargets() applies the per-asset tools allowlist to mcp entries too', () => {
  const result = resolveInstallTargets(
    { mcp: ['claude-only-mcp', 'everything'] },
    mcpManifest,
    mcpTool,
    { toolName: 'cursor' },
  );
  assert.ok(!result.mcp.includes('claude-only-mcp'));
  assert.ok(result.mcp.includes('everything'));
  assert.ok(result.warnings.some((w) => /claude-only-mcp/.test(w)));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadManifest, resolvePreset, listAssets, getAsset } from '../../src/lib/manifest.js';
import { createFakeSource } from '../helpers/fake-source.js';
import { cleanupTmpProject } from '../helpers/tmp-project.js';

const validManifest = {
  version: '1.0',
  skills: {
    'api-endpoint-design': { description: 'API endpoint design' },
    'database-migration-safety': { description: 'Migration safety' },
  },
  agents: {
    'senior-architect': { description: 'Senior architect' },
  },
  commands: {
    'summarize-diff': { description: 'Summarize diff' },
  },
  hooks: {
    'pre-commit-lint': { description: 'Pre-commit lint hook' },
  },
  presets: {
    'backend-essentials': {
      skills: ['api-endpoint-design'],
      agents: ['senior-architect'],
      commands: ['summarize-diff'],
      hooks: [],
    },
  },
};

test('loadManifest() loads valid manifest from path', () => {
  const src = createFakeSource({ manifest: validManifest });
  try {
    const m = loadManifest(src);
    assert.equal(m.version, '1.0');
    assert.ok(m.skills['api-endpoint-design']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('loadManifest() throws on missing required fields', () => {
  const bad = { version: '1.0' };
  const src = createFakeSource({ manifest: bad });
  try {
    assert.throws(() => loadManifest(src), /required|missing/i);
  } finally {
    cleanupTmpProject(src);
  }
});

test('loadManifest() throws when file missing', () => {
  assert.throws(() => loadManifest('/nonexistent-aitoolkit-manifest-dir'), /not found|ENOENT/i);
});

test('resolvePreset() returns asset list', () => {
  const preset = resolvePreset(validManifest, 'backend-essentials');
  assert.deepEqual(preset.skills, ['api-endpoint-design']);
  assert.deepEqual(preset.agents, ['senior-architect']);
  assert.deepEqual(preset.commands, ['summarize-diff']);
});

test('resolvePreset() throws on unknown preset', () => {
  assert.throws(
    () => resolvePreset(validManifest, 'no-such-preset'),
    (err) =>
      /no-such-preset/.test(err.message) && /backend-essentials/.test(err.message),
  );
});

test('listAssets() returns all assets of a type', () => {
  const skills = listAssets(validManifest, 'skills');
  assert.deepEqual(skills.sort(), ['api-endpoint-design', 'database-migration-safety']);
});

test('listAssets() returns empty array for unknown type', () => {
  const result = listAssets(validManifest, 'nonexistent');
  assert.deepEqual(result, []);
});

test('getAsset() returns asset definition', () => {
  const asset = getAsset(validManifest, 'skills', 'api-endpoint-design');
  assert.equal(asset.description, 'API endpoint design');
});

test('getAsset() throws on unknown asset', () => {
  assert.throws(
    () => getAsset(validManifest, 'skills', 'unknown'),
    /unknown.*skills|skills.*unknown/i,
  );
});

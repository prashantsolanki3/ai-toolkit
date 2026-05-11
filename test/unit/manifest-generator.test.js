import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateManifest } from '../../src/lib/manifest-generator.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function setupSource(spec) {
  const dir = createTmpProject('aitk-gen-');
  writeFile(dir, 'config/presets.json', JSON.stringify(spec.presets || { version: '1.0', presets: {} }));
  for (const [rel, content] of Object.entries(spec.files || {})) {
    writeFile(dir, rel, content);
  }
  return dir;
}

test('generateManifest: empty source yields empty manifest with declared presets', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { p1: { description: 'p1' } } },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.version, '1.0');
    assert.deepEqual(m.skills, {});
    assert.deepEqual(m.agents, {});
    assert.deepEqual(m.commands, {});
    assert.deepEqual(m.hooks, {});
    assert.deepEqual(m.rules, {});
    assert.deepEqual(m.mcp, {});
    assert.deepEqual(m.presets.p1, {
      description: 'p1',
      skills: [],
      agents: [],
      commands: [],
      hooks: [],
      rules: [],
      mcp: [],
    });
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: skill frontmatter populates skills bucket', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { 'pack-a': { description: 'pa' } } },
    files: {
      'skills/foo/SKILL.md': '---\nname: foo\ndescription: foo desc\npresets: [pack-a]\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.skills.foo.description, 'foo desc');
    assert.deepEqual(m.skills.foo.presets, ['pack-a']);
    assert.deepEqual(m.presets['pack-a'].skills, ['foo']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: derives name from directory when frontmatter omits it', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'skills/derived-name/SKILL.md': '---\ndescription: x\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.ok(m.skills['derived-name']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: agents are directories with agent.md', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'agents/arch/agent.md': '---\nname: arch\ndescription: arch\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.ok(m.agents.arch);
    assert.equal(m.agents.arch.description, 'arch');
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: commands are flat .md files', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'commands/do.md': '---\nname: do\ndescription: do thing\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.commands.do.description, 'do thing');
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: rules are flat .mdc files', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'rules/no-todo.mdc': '---\nname: no-todo\ndescription: forbid TODOs\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.rules['no-todo'].description, 'forbid TODOs');
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: hooks parse shell metadata block', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { 'qa': { description: 'qa' } } },
    files: {
      'hooks/lint.sh': [
        '#!/usr/bin/env bash',
        '# === ai-toolkit metadata ===',
        '# name: lint',
        '# description: lint hook',
        '# presets: [qa]',
        '# === end metadata ===',
        'set -e',
      ].join('\n'),
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.hooks.lint.description, 'lint hook');
    assert.deepEqual(m.presets.qa.hooks, ['lint']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: throws when asset references an undeclared preset', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { 'real-preset': { description: '' } } },
    files: {
      'skills/foo/SKILL.md': '---\nname: foo\npresets: [phantom]\n---\nbody\n',
    },
  });
  try {
    assert.throws(
      () => generateManifest(src),
      /phantom|undeclared|unknown preset/i,
    );
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: assets in multiple presets land in each one', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { p1: { description: 'p1' }, p2: { description: 'p2' } } },
    files: {
      'skills/foo/SKILL.md': '---\nname: foo\npresets: [p1, p2]\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.deepEqual(m.presets.p1.skills, ['foo']);
    assert.deepEqual(m.presets.p2.skills, ['foo']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: preserves frontmatter metadata in asset entry (author, tools)', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'skills/foo/SKILL.md': '---\nname: foo\ndescription: d\nauthor: alice\ntools: [claude-code, cursor]\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.skills.foo.author, 'alice');
    assert.deepEqual(m.skills.foo.tools, ['claude-code', 'cursor']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: throws on duplicate asset name within a type', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'skills/foo/SKILL.md': '---\nname: dup\n---\nbody\n',
      'skills/bar/SKILL.md': '---\nname: dup\n---\nbody\n',
    },
  });
  try {
    assert.throws(() => generateManifest(src), /duplicate|dup/i);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: mcp/<name>.json with description+presets+config populates mcp bucket', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: { 'pack-a': { description: 'pa' } } },
    files: {
      'mcp/everything.json': JSON.stringify({
        description: 'demo mcp server',
        presets: ['pack-a'],
        config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'] },
      }, null, 2),
    },
  });
  try {
    const m = generateManifest(src);
    assert.equal(m.mcp.everything.description, 'demo mcp server');
    assert.deepEqual(m.mcp.everything.presets, ['pack-a']);
    // The on-disk server config block should be preserved on the manifest entry
    // (so commands and tests can read the canonical value without re-reading the file).
    assert.deepEqual(m.mcp.everything.config, {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });
    assert.deepEqual(m.presets['pack-a'].mcp, ['everything']);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: mcp asset can declare tools allowlist and overrides', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'mcp/cool-server.json': JSON.stringify({
        description: 'd',
        config: { command: 'x' },
        tools: ['claude-code'],
        overrides: { 'gemini-cli': { httpUrl: 'http://example' } },
      }, null, 2),
    },
  });
  try {
    const m = generateManifest(src);
    assert.deepEqual(m.mcp['cool-server'].tools, ['claude-code']);
    assert.deepEqual(m.mcp['cool-server'].overrides, { 'gemini-cli': { httpUrl: 'http://example' } });
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: mcp entry missing the config block throws', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'mcp/broken.json': JSON.stringify({ description: 'no config here' }),
    },
  });
  try {
    assert.throws(() => generateManifest(src), /config|mcp/i);
  } finally {
    cleanupTmpProject(src);
  }
});

test('generateManifest: skips directories without the expected entry file', () => {
  const src = setupSource({
    presets: { version: '1.0', presets: {} },
    files: {
      'skills/incomplete/notes.md': 'no SKILL.md here',
      'skills/proper/SKILL.md': '---\nname: proper\n---\nbody\n',
    },
  });
  try {
    const m = generateManifest(src);
    assert.ok(m.skills.proper);
    assert.equal(m.skills.incomplete, undefined);
  } finally {
    cleanupTmpProject(src);
  }
});

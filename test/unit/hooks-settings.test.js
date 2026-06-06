import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import {
  registerHookInSettings,
  removeHookFromSettings,
  isHookRegistered,
} from '../../src/lib/hooks-settings.js';

const WRAPPER = ['hooks'];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('registerHookInSettings: writes a schema-valid SessionStart entry into settings.json', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    registerHookInSettings({
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    });

    const data = readJson(filePath);
    // settings format: events nested under top-level "hooks" key
    assert.ok(data.hooks, 'top-level hooks key present');
    assert.ok(Array.isArray(data.hooks.SessionStart), 'SessionStart is an array of matcher groups');
    assert.equal(data.hooks.SessionStart.length, 1);
    const group = data.hooks.SessionStart[0];
    assert.ok(Array.isArray(group.hooks), 'matcher group has a hooks array');
    assert.deepEqual(group.hooks[0], {
      type: 'command',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    });
  } finally {
    cleanupTmpProject(dir);
  }
});

test('registerHookInSettings: PreToolUse entries carry a matcher', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    registerHookInSettings({
      filePath,
      wrapperPath: WRAPPER,
      event: 'PreToolUse',
      command: 'bash "/proj/.claude/hooks/guard.sh"',
      matcher: 'Write|Edit',
    });
    const data = readJson(filePath);
    const group = data.hooks.PreToolUse[0];
    assert.equal(group.matcher, 'Write|Edit');
    assert.equal(group.hooks[0].command, 'bash "/proj/.claude/hooks/guard.sh"');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('registerHookInSettings: re-registering the same command is idempotent', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    const args = {
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    };
    registerHookInSettings(args);
    registerHookInSettings(args);
    registerHookInSettings(args);

    const data = readJson(filePath);
    // No duplicated command across all SessionStart groups.
    const commands = data.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.equal(commands.length, 1, 'command registered exactly once');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('registerHookInSettings: preserves unrelated user hook entries', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    // A user already has their own hooks + unrelated top-level settings.
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          permissions: { allow: ['Bash(npm test)'] },
          hooks: {
            SessionStart: [
              { hooks: [{ type: 'command', command: 'bash "/me/my-own.sh"' }] },
            ],
            Stop: [
              { hooks: [{ type: 'command', command: 'bash "/me/stop.sh"' }] },
            ],
          },
        },
        null,
        2,
      ),
    );

    registerHookInSettings({
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    });

    const data = readJson(filePath);
    // Unrelated settings preserved.
    assert.deepEqual(data.permissions, { allow: ['Bash(npm test)'] });
    // Unrelated Stop hook preserved untouched.
    assert.equal(data.hooks.Stop[0].hooks[0].command, 'bash "/me/stop.sh"');
    // The user's own SessionStart hook preserved.
    const ssCommands = data.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(ssCommands.includes('bash "/me/my-own.sh"'), 'user SessionStart hook preserved');
    assert.ok(
      ssCommands.includes('bash "/proj/.claude/hooks/branch-from-main.sh"'),
      'our hook added',
    );
  } finally {
    cleanupTmpProject(dir);
  }
});

test('isHookRegistered: true after register, false after remove', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    const args = {
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    };
    assert.equal(isHookRegistered(args), false);
    registerHookInSettings(args);
    assert.equal(isHookRegistered(args), true);
    removeHookFromSettings(args);
    assert.equal(isHookRegistered(args), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removeHookFromSettings: drops only our command, keeps the user group entry alive', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { type: 'command', command: 'bash "/me/my-own.sh"' },
                  { type: 'command', command: 'bash "/proj/.claude/hooks/branch-from-main.sh"' },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    removeHookFromSettings({
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    });
    const data = readJson(filePath);
    const commands = data.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.deepEqual(commands, ['bash "/me/my-own.sh"']);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('register/remove do not corrupt settings when the hooks wrapper is an array (bad input)', () => {
  const dir = createTmpProject();
  try {
    const filePath = path.join(dir, 'settings.json');
    // Pathological / corrupt input: hooks is an array, not the expected object.
    fs.writeFileSync(filePath, JSON.stringify({ hooks: ['oops'] }, null, 2));

    const args = {
      filePath,
      wrapperPath: WRAPPER,
      event: 'SessionStart',
      command: 'bash "/proj/.claude/hooks/branch-from-main.sh"',
    };

    // register must replace the array root with a clean event map — NOT fold
    // the array's numeric indices ("0") into the hooks object.
    registerHookInSettings(args);
    const data = readJson(filePath);
    assert.ok(!Array.isArray(data.hooks), 'hooks is an object after register');
    assert.ok(!Object.hasOwn(data.hooks, '0'), 'array index 0 not leaked as a key');
    assert.equal(data.hooks.SessionStart[0].hooks[0].command, args.command);

    // remove against an array wrapper is a safe no-op (returns input untouched).
    fs.writeFileSync(filePath, JSON.stringify({ hooks: ['oops'] }, null, 2));
    const res = removeHookFromSettings(args);
    assert.deepEqual(res, { hooks: ['oops'] }, 'remove leaves a corrupt array root untouched');
  } finally {
    cleanupTmpProject(dir);
  }
});

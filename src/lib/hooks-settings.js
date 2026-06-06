import path from 'node:path';
import { getSettingsConfigPath, getSettingsWrapperPath } from './tools.js';
import {
  readJsonFile,
  writeJsonFile,
  getAtPath,
  setAtPath,
  hashJsonValue,
} from './json-merge.js';

// Hook registration into a tool's settings file.
//
// Claude Code (and tools like it) only run a hook script if it is referenced
// from settings.json under a `hooks` block. Dropping the .sh into
// .claude/hooks/ is necessary but NOT sufficient — without the settings entry
// the hook never fires. This module owns writing that entry.
//
// settings.json hooks shape (the "settings format" — events nested under a
// top-level "hooks" key):
//
//   {
//     "hooks": {
//       "SessionStart": [
//         { "hooks": [ { "type": "command", "command": "bash \"...\"" } ] }
//       ],
//       "PreToolUse": [
//         { "matcher": "Write|Edit",
//           "hooks": [ { "type": "command", "command": "bash \"...\"" } ] }
//       ]
//     }
//   }
//
// An event maps to an ARRAY of matcher groups; each group has an optional
// `matcher` (only meaningful for tool-scoped events) and a `hooks` array of
// `{ type:"command", command:"<...>" }`. We dedup by command string so
// re-installing never duplicates an entry, and we touch only the group whose
// matcher matches ours — every unrelated event and unrelated command in the
// file is preserved verbatim.

// Events that filter on a tool name and therefore carry a `matcher`. Every
// other event (SessionStart, SessionEnd, Stop, SubagentStop, PreCompact,
// Notification) is session/lifecycle-scoped and runs unconditionally, so we
// omit the matcher entirely to match the canonical settings.json shape.
const MATCHER_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'UserPromptSubmit']);

export function eventUsesMatcher(event) {
  return MATCHER_EVENTS.has(event);
}

// Resolve where this tool stores its hook-settings entries at the requested
// scope, mirroring resolveMcpDestination. Returns null when the tool has no
// settings file for this scope (or doesn't support hook registration at all).
export function resolveHooksSettings({ tool, scope, projectRoot }) {
  try {
    return {
      filePath: getSettingsConfigPath(tool, scope, projectRoot),
      wrapperPath: getSettingsWrapperPath(tool),
    };
  } catch {
    return null;
  }
}

// Build the command string a tool's settings entry should run. The installed
// script lives at hookDestPath; we invoke it via bash with the absolute path
// quoted so it fires regardless of the user's cwd or shebang bit.
export function buildHookCommand({ hookDestPath }) {
  return `bash "${hookDestPath}"`;
}

// Normalise a matcher for comparison — undefined and "" are the same "no
// matcher" group for non-tool events.
function sameMatcher(a, b) {
  return (a ?? '') === (b ?? '');
}

// Find the group within `event`'s array that matches `matcher`, or undefined.
function findGroup(groups, matcher) {
  return groups.find((g) => sameMatcher(g.matcher, matcher));
}

function groupHasCommand(group, command) {
  return Array.isArray(group.hooks) && group.hooks.some((h) => h.command === command);
}

export function isHookRegistered({ filePath, wrapperPath, event, command, matcher }) {
  const data = readJsonFile(filePath);
  if (!data) return false;
  const root = getAtPath(data, wrapperPath);
  const groups = root?.[event];
  if (!Array.isArray(groups)) return false;
  const group = findGroup(groups, matcher);
  return Boolean(group && groupHasCommand(group, command));
}

// Idempotent registration. Reads the current settings file (or starts empty),
// adds `{ type:"command", command }` under wrapperPath[event] in the group
// for `matcher`, creating the event array / group as needed, and writes back.
// Returns the new settings object.
export function registerHookInSettings({ filePath, wrapperPath, event, command, matcher }) {
  const current = readJsonFile(filePath) || {};
  const root = getAtPath(current, wrapperPath);
  const groups = Array.isArray(root?.[event]) ? root[event].map(cloneGroup) : [];

  let group = findGroup(groups, matcher);
  if (!group) {
    group = eventUsesMatcher(event)
      ? { matcher: matcher ?? '', hooks: [] }
      : { hooks: [] };
    groups.push(group);
  }
  group.hooks = Array.isArray(group.hooks) ? group.hooks.slice() : [];

  if (!groupHasCommand(group, command)) {
    group.hooks.push({ type: 'command', command });
  }

  // Rebuild the event map under the wrapper, preserving sibling events.
  const nextRoot = { ...(root && typeof root === 'object' ? root : {}), [event]: groups };
  const next = setAtPathWhole(current, wrapperPath, nextRoot);
  writeJsonFile(filePath, next);
  return next;
}

// Remove our command from the group; if the group is left empty, drop it; if
// the event is left empty, drop it. Never touches unrelated commands, groups,
// or events. No-op when the file or entry is absent.
export function removeHookFromSettings({ filePath, wrapperPath, event, command, matcher }) {
  const current = readJsonFile(filePath);
  if (!current) return null;
  const root = getAtPath(current, wrapperPath);
  if (!root || !Array.isArray(root[event])) return current;

  const groups = root[event]
    .map(cloneGroup)
    .map((g) => {
      if (!sameMatcher(g.matcher, matcher)) return g;
      g.hooks = (g.hooks || []).filter((h) => h.command !== command);
      return g;
    })
    .filter((g) => (g.hooks || []).length > 0);

  const nextRoot = { ...root };
  if (groups.length > 0) {
    nextRoot[event] = groups;
  } else {
    delete nextRoot[event];
  }
  const next = setAtPathWhole(current, wrapperPath, nextRoot);
  writeJsonFile(filePath, next);
  return next;
}

// Stable hash of the registered command — recorded in the lockfile so we can
// later tell whether the user hand-edited our settings entry.
export function hookSettingsSha({ event, command, matcher }) {
  return hashJsonValue({ event, command, matcher: matcher ?? '' });
}

function cloneGroup(g) {
  return { ...g, hooks: Array.isArray(g.hooks) ? g.hooks.map((h) => ({ ...h })) : [] };
}

// setAtPath sets a single leaf key; here we need to replace the whole object
// living AT wrapperPath. Split off the last segment and set it.
function setAtPathWhole(obj, wrapperPath, value) {
  if (wrapperPath.length === 0) {
    return value;
  }
  const parent = wrapperPath.slice(0, -1);
  const key = wrapperPath[wrapperPath.length - 1];
  return setAtPath(obj, parent, key, value);
}

// Re-export so install/remove can build a relativeable display path.
export function relSettings(projectRoot, filePath) {
  return path.relative(projectRoot, filePath) || filePath;
}

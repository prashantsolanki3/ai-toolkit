import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEV_SKILLS_SKILLS = ['safe-change', 'review-pr', 'craft-skill', 'gh-project-sync'];

test('skill bodies use markdown emphasis for cross-refs, not [[wiki-link]] syntax (ADR-0005 decision 6)', () => {
  for (const name of DEV_SKILLS_SKILLS) {
    const body = fs.readFileSync(path.join(REPO_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    assert.ok(
      !/\[\[[^\]]+\]\]/.test(body),
      `skills/${name}/SKILL.md contains [[wiki-link]] syntax — use markdown emphasis (\`name\`) for cross-references in skill bodies (Claude Code does not resolve wiki-links at runtime)`,
    );
  }
});

test('every dev-skills skill carries a ## Cross-references section', () => {
  // ADR-0005 decision 7: bodies that reference each other should make co-installation
  // obvious. Each skill body must declare a `## Cross-references` section so the
  // reader knows which sibling assets this one expects. We don't resolve the refs
  // mechanically (subcommands and flags share the kebab-case shape and trip naive
  // regex); decision 7 is enforced by shipping the whole preset, not by individual
  // ref validation.
  for (const name of DEV_SKILLS_SKILLS) {
    const body = fs.readFileSync(path.join(REPO_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(
      body,
      /^##\s+Cross-references\s*$/m,
      `skills/${name}/SKILL.md must declare a ## Cross-references section so sibling-asset dependencies are explicit`,
    );
  }
});

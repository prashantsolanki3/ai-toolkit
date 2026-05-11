// test/helpers/legacy-fixture.js
//
// Reconstructs the asset shapes the original integration tests were written
// against, as a fake source repo. The real toolkit now ships only the
// docs-maintainer agent, skill-evaluator skill, and eval-skill / improve-skill
// commands; everything else used to be sample content that was removed in
// the cleanup. The tests still need to exercise behaviours like "remove a
// preset" or "install a hook with a sidecar," so we rebuild representative
// assets here purely as test fixtures.
//
// Every fixture is created in a fresh tmp dir (via createTmpProject) and is
// the caller's responsibility to clean up with cleanupTmpProject.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTmpProject } from './tmp-project.js';
import { generateManifest } from '../../src/lib/manifest-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Re-use the real tools.json + schema so the fixture exercises the same
// per-tool destinations the production toolkit does.
function copyConfigFromRepo(dir) {
  const dest = path.join(dir, 'config');
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'config', 'tools.json'),
    path.join(dest, 'tools.json'),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, 'config', 'tools.schema.json'),
    path.join(dest, 'tools.schema.json'),
  );
  // Custom presets.json that the legacy tests' assets reference.
  fs.writeFileSync(
    path.join(dest, 'presets.json'),
    JSON.stringify(
      {
        version: '1.0',
        presets: {
          'backend-essentials': { description: 'legacy fixture preset' },
          'maintenance-mode': { description: 'legacy fixture preset' },
          'quality-gates': { description: 'legacy fixture preset' },
          'skill-development': { description: 'legacy fixture preset' },
        },
      },
      null,
      2,
    ),
  );
}

function writeMd(p, frontmatter, body) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((x) => `  - ${x}`).join('\n')}`;
      }
      if (typeof v === 'object' && v !== null) {
        const inner = Object.entries(v)
          .map(([kk, vv]) => {
            if (typeof vv === 'object' && !Array.isArray(vv)) {
              const lines = Object.entries(vv).map(([k3, v3]) => `    ${k3}: ${JSON.stringify(v3)}`);
              return `  ${kk}:\n${lines.join('\n')}`;
            }
            return `  ${kk}: ${JSON.stringify(vv)}`;
          })
          .join('\n');
        return `${k}:\n${inner}`;
      }
      return `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`;
    })
    .join('\n');
  fs.writeFileSync(p, `---\n${fm}\n---\n\n${body}\n`);
}

function writeHook(p, name, description, presets) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const presetBlock = presets.length
    ? `# presets:\n${presets.map((x) => `#   - ${x}`).join('\n')}\n`
    : '';
  fs.writeFileSync(
    p,
    [
      '#!/usr/bin/env bash',
      '# === ai-toolkit metadata ===',
      `# name: ${name}`,
      `# description: ${description}`,
      '# author: fixture',
      presetBlock.trimEnd(),
      '# === end metadata ===',
      '',
      'set -euo pipefail',
      'echo "fixture hook"',
      '',
    ].join('\n'),
  );
  fs.chmodSync(p, 0o755);
}

function regenerateManifest(dir) {
  const manifest = generateManifest(dir);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

/**
 * Reconstruct the deleted sample assets as a fake source tree.
 *
 * Returns an absolute path to a tmp dir laid out exactly like the legacy
 * repo state, including:
 *   - 5 skills: api-endpoint-design, code-review-checklist, comprehensive-review
 *     (multi-folder with eval.json), database-migration-safety,
 *     dependency-upgrade, error-handling-patterns
 *   - 3 agents: refactoring-specialist, senior-architect, test-writer
 *   - 3 commands: bump-version, explain-error, summarize-diff
 *   - 2 hooks: post-merge-install, pre-commit-lint
 *   - 2 rules: no-bare-todos, prefer-typed-errors (with overrides.cursor)
 *   - 4 presets: backend-essentials, maintenance-mode, quality-gates,
 *     skill-development
 *
 * Caller-side responsibility: cleanupTmpProject(returnedDir) when done.
 */
export function buildLegacyFixture() {
  const dir = createTmpProject('ai-toolkit-legacy-fixture-');

  copyConfigFromRepo(dir);

  // ── skills ────────────────────────────────────────────────────────
  writeMd(
    path.join(dir, 'skills', 'api-endpoint-design', 'SKILL.md'),
    {
      name: 'api-endpoint-design',
      description: 'Checklist for designing new HTTP/REST endpoints — naming, status codes, pagination, versioning.',
      author: 'fixture',
      presets: ['backend-essentials'],
    },
    '# API Endpoint Design\n\nLegacy fixture body for tests.',
  );

  writeMd(
    path.join(dir, 'skills', 'code-review-checklist', 'SKILL.md'),
    {
      name: 'code-review-checklist',
      description: 'A short, generic checklist to apply when reviewing a code change.',
      author: 'fixture',
      presets: ['backend-essentials', 'maintenance-mode', 'quality-gates'],
    },
    '# Code Review Checklist\n\nLegacy fixture body. Mentions "Code Review Checklist" so existing tests match.',
  );

  writeMd(
    path.join(dir, 'skills', 'database-migration-safety', 'SKILL.md'),
    {
      name: 'database-migration-safety',
      description: 'Patterns for zero-downtime schema migrations on relational databases.',
      author: 'fixture',
      presets: ['backend-essentials'],
    },
    '# Database Migration Safety\n\nLegacy fixture body.',
  );

  writeMd(
    path.join(dir, 'skills', 'dependency-upgrade', 'SKILL.md'),
    {
      name: 'dependency-upgrade',
      description: 'A systematic approach to upgrading a dependency safely.',
      author: 'fixture',
      presets: ['maintenance-mode'],
    },
    '# Dependency Upgrade\n\nLegacy fixture body.',
  );

  writeMd(
    path.join(dir, 'skills', 'error-handling-patterns', 'SKILL.md'),
    {
      name: 'error-handling-patterns',
      description: 'Patterns for consistent, debuggable error handling across a codebase.',
      author: 'fixture',
      presets: ['backend-essentials', 'quality-gates'],
    },
    '# Error Handling Patterns\n\nLegacy fixture body. Mentions "Error Handling" so existing tests match.',
  );

  // Multi-folder skill (comprehensive-review) — has eval.json, scripts/, references/.
  writeMd(
    path.join(dir, 'skills', 'comprehensive-review', 'SKILL.md'),
    {
      name: 'comprehensive-review',
      description: 'Deep code review skill with referenced scripts, style references, and evaluation prompts.',
      author: 'fixture',
      presets: ['quality-gates'],
    },
    '# Comprehensive Review\n\nLegacy multi-folder fixture body.',
  );
  fs.mkdirSync(path.join(dir, 'skills', 'comprehensive-review', 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'skills', 'comprehensive-review', 'scripts', 'precheck.sh'),
    '#!/usr/bin/env bash\necho "fixture precheck"\n',
  );
  fs.chmodSync(path.join(dir, 'skills', 'comprehensive-review', 'scripts', 'precheck.sh'), 0o755);
  fs.mkdirSync(path.join(dir, 'skills', 'comprehensive-review', 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'skills', 'comprehensive-review', 'references', 'style-guide.md'),
    '# Style guide (fixture)\n',
  );
  fs.writeFileSync(
    path.join(dir, 'skills', 'comprehensive-review', 'eval.json'),
    JSON.stringify(
      {
        version: '1.0',
        skill: 'comprehensive-review',
        description: 'Legacy fixture eval suite.',
        target_pass_rate: 0.85,
        tests: [
          {
            id: 'a',
            description: 'first',
            input: 'review this',
            assertions: [{ type: 'contains', value: 'review' }],
          },
          {
            id: 'b',
            description: 'second',
            input: 'review again',
            assertions: [{ type: 'min_length', value: 1 }],
          },
          {
            id: 'c',
            description: 'third',
            input: 'review thrice',
            assertions: [{ type: 'not_contains', value: 'forbidden' }],
          },
        ],
      },
      null,
      2,
    ),
  );

  // ── agents ────────────────────────────────────────────────────────
  writeMd(
    path.join(dir, 'agents', 'refactoring-specialist', 'agent.md'),
    {
      name: 'refactoring-specialist',
      description: 'Identifies and applies refactoring patterns without changing behavior.',
      author: 'fixture',
      presets: ['maintenance-mode'],
    },
    '# Refactoring Specialist\n\nLegacy fixture body.',
  );
  writeMd(
    path.join(dir, 'agents', 'senior-architect', 'agent.md'),
    {
      name: 'senior-architect',
      description: 'System design reviewer focused on scale, failure modes, and tradeoffs.',
      author: 'fixture',
      presets: ['backend-essentials'],
    },
    '# Senior Architect\n\nLegacy fixture body.',
  );
  writeMd(
    path.join(dir, 'agents', 'test-writer', 'agent.md'),
    {
      name: 'test-writer',
      description: 'Generates test cases from acceptance criteria or function signatures.',
      author: 'fixture',
      presets: ['quality-gates'],
    },
    '# Test Writer\n\nLegacy fixture body.',
  );

  // ── commands ──────────────────────────────────────────────────────
  writeMd(
    path.join(dir, 'commands', 'summarize-diff.md'),
    {
      name: 'summarize-diff',
      description: 'Generate a clean PR description from a git diff.',
      author: 'fixture',
      presets: ['backend-essentials'],
    },
    '# /summarize-diff\n\nLegacy fixture body. Mentions "summarize" for tests.',
  );
  writeMd(
    path.join(dir, 'commands', 'explain-error.md'),
    {
      name: 'explain-error',
      description: 'Analyze a stack trace or error message and explain the root cause.',
      author: 'fixture',
      presets: ['maintenance-mode'],
    },
    '# /explain-error\n\nLegacy fixture body.',
  );
  writeMd(
    path.join(dir, 'commands', 'bump-version.md'),
    {
      name: 'bump-version',
      description: 'Update version across package metadata, changelog, and tags consistently.',
      author: 'fixture',
      presets: ['maintenance-mode'],
    },
    '# /bump-version\n\nLegacy fixture body.',
  );

  // ── hooks ─────────────────────────────────────────────────────────
  writeHook(
    path.join(dir, 'hooks', 'pre-commit-lint.sh'),
    'pre-commit-lint',
    'Sample lint-staged pre-commit hook.',
    ['quality-gates'],
  );
  writeHook(
    path.join(dir, 'hooks', 'post-merge-install.sh'),
    'post-merge-install',
    'Runs npm/pnpm/yarn install when the lockfile changed after merge.',
    [],
  );

  // ── rules ─────────────────────────────────────────────────────────
  writeMd(
    path.join(dir, 'rules', 'no-bare-todos.mdc'),
    {
      name: 'no-bare-todos',
      description: 'Disallow bare TODO/FIXME comments without an issue or ticket reference.',
      author: 'fixture',
      presets: ['quality-gates'],
      tools: ['cursor', 'claude-code'],
    },
    '# Rule: no bare TODOs\n\nLegacy fixture body.',
  );
  writeMd(
    path.join(dir, 'rules', 'prefer-typed-errors.mdc'),
    {
      name: 'prefer-typed-errors',
      description: 'Prefer specific error types over a generic Error / Exception / RuntimeException.',
      author: 'fixture',
      presets: ['quality-gates'],
      tools: ['cursor', 'claude-code'],
      overrides: {
        cursor: {
          alwaysApply: true,
          globs: '**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,rb}',
        },
      },
    },
    '# Rule: prefer typed errors\n\nLegacy fixture body.',
  );

  regenerateManifest(dir);
  return dir;
}

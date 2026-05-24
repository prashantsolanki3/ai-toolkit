import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'e2e.sh');

test('e2e.sh asserts the lockfile at the project root, not under .claude/', () => {
  const body = fs.readFileSync(SCRIPT, 'utf8');

  assert.ok(
    !body.includes('.claude/.ai-toolkit-lock.json'),
    'e2e.sh still references the v1-era .claude/.ai-toolkit-lock.json — the v2.0 unified lockfile lives at <projectRoot>/.ai-toolkit-lock.json',
  );

  assert.match(
    body,
    /^\s*test -f \.ai-toolkit-lock\.json\s*$/m,
    'e2e.sh must assert `test -f .ai-toolkit-lock.json` (at project root) to confirm the install wrote the unified v2.0 lockfile',
  );
});

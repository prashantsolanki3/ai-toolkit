import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const README = path.join(REPO_ROOT, 'README.md');

function liveStaticTestCount() {
  // `grep -Hc` forces `file:count` output even when xargs invokes grep with
  // a single filename (where bare `grep -c` would print just the count).
  // Without -H the awk -F: split misses single-file batches and undercounts.
  const out = execFileSync(
    'bash',
    ['-lc', `find test -name '*.test.js' -print0 | xargs -0 grep -Hc '^test(' 2>/dev/null | awk -F: '{s+=$2} END {print s}'`],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  ).trim();
  const n = Number.parseInt(out, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Could not compute live test count from \`find test -name '*.test.js' | xargs grep -c '^test('\` — got ${JSON.stringify(out)}`);
  }
  return n;
}

test('README test-count claim matches the live count within ±5%', () => {
  const readme = fs.readFileSync(README, 'utf8');
  const claimMatch = readme.match(/#\s*(\d+)\s+tests,\s+expect\s+green/);
  assert.ok(claimMatch, "README must contain a `make test  # <N> tests, expect green` line so the count is auditable");
  const claimed = Number.parseInt(claimMatch[1], 10);

  const live = liveStaticTestCount();
  const slack = Math.max(5, Math.ceil(live * 0.05));
  const lo = live - slack;
  const hi = live + slack;

  assert.ok(
    claimed >= lo && claimed <= hi,
    `README claims ${claimed} tests; live count is ${live} static \`test()\` calls. ` +
    `Expected README value in [${lo}, ${hi}] (live ± ${slack}). ` +
    `Update the README block: \`make test  # ${live} tests, expect green\`.`,
  );
});

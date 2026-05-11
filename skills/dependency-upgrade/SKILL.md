---
name: dependency-upgrade
description: A systematic approach to upgrading a dependency safely.
---

# Dependency Upgrade

## When to use this skill

Invoke this skill when bumping a non-trivial dependency — major versions, security advisories, frameworks. For routine patch bumps, the lockfile and CI handle it.

## When not to use it

- Patch upgrades within a stable minor (e.g. `1.4.2 → 1.4.3`) — just bump and ship.
- New install of a brand-new dependency — different workflow.

## Procedure

1. **Read the upstream changelog.** Skim every entry between the current and target version. Look for breaking changes, removed APIs, behavior changes (especially defaults), and security fixes you should know about.
2. **Inventory call sites.** Grep the codebase for direct usage of the package. Note any APIs that the changelog flagged as changed.
3. **Bump in isolation.** Update the package, regenerate the lockfile, do not change anything else yet. Run the full test suite. Capture every failure.
4. **Fix call sites one cluster at a time.** Group failures by root cause. Each fix should be a small commit with a clear message tying back to the upgrade.
5. **Read the diff yourself.** A passing test suite is not a guarantee. Skim the call sites you didn't have to touch; confirm that runtime semantics are still what you expect.
6. **Stage rollout.** Deploy behind a feature flag if the dependency is on the request path, or canary deploy if you have that infrastructure.
7. **Watch for 24-48 hours.** New errors, latency regressions, log noise. Have a rollback plan ready.

## Watch for

- Transitive dependency upgrades pulled in by the bump — sometimes these cause more disruption than the direct one.
- Peer dependency warnings that resolve to a different version than you expect.
- Behavior changes that aren't called out in the changelog (the dreaded silent breaking change). Integration tests are your safety net here.

<!-- MIT, see LICENSE -->

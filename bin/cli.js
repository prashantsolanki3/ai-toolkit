#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';

// Exit cleanly when our stdout is closed by a downstream pipe (e.g.
// `ai-toolkit list | head -3`). Without this Node throws EPIPE.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(0);
  });
}
import { install } from '../src/commands/install.js';
import { update } from '../src/commands/update.js';
import { remove } from '../src/commands/remove.js';
import { list } from '../src/commands/list.js';
import { installed } from '../src/commands/installed.js';
import { createLogger } from '../src/lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, '..');

function makeLogger(opts) {
  return createLogger({ verbose: Boolean(opts.verbose) });
}

function splitList(value, prev = []) {
  return [...prev, ...value.split(',').map((s) => s.trim()).filter(Boolean)];
}

function commonAssetOptions(cmd) {
  return cmd
    .option('--skills <name>', 'skill name (repeatable, comma-separated)', splitList, [])
    .option('--agents <name>', 'agent name (repeatable, comma-separated)', splitList, [])
    .option('--commands <name>', 'command name (repeatable, comma-separated)', splitList, [])
    .option('--hooks <name>', 'hook name (repeatable, comma-separated)', splitList, [])
    .option('--rules <name>', 'rule name (repeatable, comma-separated)', splitList, [])
    .option('--mcp <name>', 'MCP server name (repeatable, comma-separated)', splitList, []);
}

const program = new Command();

program
  .name('ai-toolkit')
  .description('Install and update skills, agents, commands, and hooks across AI coding tools')
  .version('0.1.0')
  .showHelpAfterError();

const installCmd = program
  .command('install')
  .description('Install assets into the tool-specific subdir under a project root. Without --tool, installs for every tool in config/tools.json (deduped by destination).')
  .option('--tool <name>', 'target tool (e.g. claude-code, cursor, antigravity). When omitted, installs for every configured tool.')
  .option('--preset <name>', 'preset to install')
  .option('--all', 'install every shipped asset of every type the tool supports (cannot be combined with --preset)', false)
  .addOption(new Option('--scope <scope>', 'install scope').choices(['global', 'workspace']).default('workspace'))
  .option('--target <path>', 'project root (defaults to current directory). The tool decides which subdirectory to populate inside it (.claude, .cursor, .github, ...).')
  .option('--force', 'overwrite destinations that already exist or have local edits', false)
  .option('--link', 'symlink assets where format matches; copy where transformation is required', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false);

commonAssetOptions(installCmd).action(async (opts) => {
  const logger = makeLogger(opts);
  await install({
    tool: opts.tool,
    preset: opts.preset,
    all: opts.all,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
    mcp: opts.mcp,
    scope: opts.scope,
    target: opts.target,
    force: opts.force,
    link: opts.link,
    dryRun: opts.dryRun,
    sourceRoot: SOURCE_ROOT,
    logger,
  });
});

const updateCmd = program
  .command('update')
  .description('Update installed assets from the source. Without filters, updates every tracked asset; with --preset / --skills / --agents / --commands / --hooks / --rules / --mcp, restrict the update to those.')
  .option('--target <path>', 'project root (defaults to current directory)')
  .option('--tool <name>', 'specific tool to update; if omitted, autodiscover by scanning tool subdirs for lockfiles')
  .option('--preset <name>', 'restrict the update to assets in this preset')
  .addOption(new Option('--scope <scope>', 'install scope').choices(['global', 'workspace']).default('workspace'))
  .option('--force', 'overwrite local edits', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false);

commonAssetOptions(updateCmd).action(async (opts) => {
  const logger = makeLogger(opts);
  await update({
    target: opts.target,
    tool: opts.tool,
    preset: opts.preset,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
    mcp: opts.mcp,
    scope: opts.scope,
    sourceRoot: SOURCE_ROOT,
    force: opts.force,
    dryRun: opts.dryRun,
    logger,
  });
});

const removeCmd = program
  .command('remove')
  .description('Remove installed assets. Use --all, --preset, or per-type asset lists; combinations are unioned.')
  .option('--target <path>', 'project root (defaults to current directory)')
  .option('--tool <name>', 'specific tool to remove from; if omitted, autodiscover')
  .option('--preset <name>', 'remove every tracked asset that belongs to this preset')
  .addOption(new Option('--scope <scope>', 'install scope').choices(['global', 'workspace']).default('workspace'))
  .option('--all', 'remove every tracked asset', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false);

commonAssetOptions(removeCmd).action(async (opts) => {
  const logger = makeLogger(opts);
  await remove({
    target: opts.target,
    tool: opts.tool,
    preset: opts.preset,
    scope: opts.scope,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
    mcp: opts.mcp,
    all: opts.all,
    dryRun: opts.dryRun,
    sourceRoot: SOURCE_ROOT,
    logger,
  });
});

program
  .command('list')
  .description('List available assets, presets, or tools. With --tool, restrict the listing to what that tool supports (and honour each asset\'s tools: allowlist).')
  .option('--type <type>', 'one of: skills, agents, commands, hooks, rules, mcp, presets, tools')
  .option('--tool <name>', 'restrict the listing to assets supported by this tool')
  .option('--verbose', 'verbose output', false)
  .action(async (opts) => {
    const logger = makeLogger(opts);
    await list({
      type: opts.type,
      tool: opts.tool,
      sourceRoot: SOURCE_ROOT,
      logger,
    });
  });

program
  .command('installed')
  .description('Show what is installed in the project. Without --tool, scans every tool subdir for a lockfile. --type and --preset filter the report.')
  .option('--target <path>', 'project root (defaults to current directory)')
  .option('--tool <name>', 'show only this tool')
  .option('--type <type>', 'filter the report to a single asset type (skills, agents, commands, hooks, rules, mcp)')
  .option('--preset <name>', 'filter the report to assets in this preset')
  .option('--scope <scope>', 'workspace (default) or global')
  .option('--check', 'drift-check mode: exit non-zero if any installed asset has drifted from its lockfile sha', false)
  .option('--verbose', 'verbose output', false)
  .action(async (opts) => {
    const logger = makeLogger(opts);
    const res = await installed({
      target: opts.target,
      tool: opts.tool,
      type: opts.type,
      preset: opts.preset,
      scope: opts.scope,
      check: opts.check,
      sourceRoot: SOURCE_ROOT,
      logger,
    });
    if (opts.check && res && Array.isArray(res.drift) && res.drift.length > 0) {
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  const logger = createLogger();
  logger.error(err.message || String(err));
  process.exit(1);
});

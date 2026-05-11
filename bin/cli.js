#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
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
    .option('--rules <name>', 'rule name (repeatable, comma-separated)', splitList, []);
}

const program = new Command();

program
  .name('ai-toolkit')
  .description('Install and update skills, agents, commands, and hooks across AI coding tools')
  .version('0.1.0')
  .showHelpAfterError();

const installCmd = program
  .command('install')
  .description('Install assets into a target directory')
  .requiredOption('--tool <name>', 'target tool (e.g. claude-code, cursor, antigravity)')
  .option('--preset <name>', 'preset to install')
  .addOption(new Option('--scope <scope>', 'install scope').choices(['global', 'workspace']).default('workspace'))
  .option('--target <path>', 'override the default install target')
  .option('--force', 'overwrite destinations that already exist or have local edits', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false);

commonAssetOptions(installCmd).action(async (opts) => {
  const logger = makeLogger(opts);
  await install({
    tool: opts.tool,
    preset: opts.preset,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
    scope: opts.scope,
    target: opts.target,
    force: opts.force,
    dryRun: opts.dryRun,
    sourceRoot: SOURCE_ROOT,
    logger,
  });
});

program
  .command('update')
  .description('Update installed assets from the source')
  .option('--target <path>', 'target directory (default: .claude in cwd)')
  .option('--force', 'overwrite local edits', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false)
  .action(async (opts) => {
    const logger = makeLogger(opts);
    const target = opts.target || path.resolve(process.cwd(), '.claude');
    await update({ target, sourceRoot: SOURCE_ROOT, force: opts.force, dryRun: opts.dryRun, logger });
  });

const removeCmd = program
  .command('remove')
  .description('Remove installed assets')
  .option('--target <path>', 'target directory (default: .claude in cwd)')
  .option('--all', 'remove every tracked asset', false)
  .option('--dry-run', 'plan only, write nothing', false)
  .option('--verbose', 'verbose output', false);

commonAssetOptions(removeCmd).action(async (opts) => {
  const logger = makeLogger(opts);
  const target = opts.target || path.resolve(process.cwd(), '.claude');
  await remove({
    target,
    skills: opts.skills,
    agents: opts.agents,
    commands: opts.commands,
    hooks: opts.hooks,
    rules: opts.rules,
    all: opts.all,
    dryRun: opts.dryRun,
    sourceRoot: SOURCE_ROOT,
    logger,
  });
});

program
  .command('list')
  .description('List available assets, presets, or tools')
  .option('--type <type>', 'one of: skills, agents, commands, hooks, presets, tools')
  .option('--verbose', 'verbose output', false)
  .action(async (opts) => {
    const logger = makeLogger(opts);
    await list({ type: opts.type, sourceRoot: SOURCE_ROOT, logger });
  });

program
  .command('installed')
  .description('Show what is installed in the target directory')
  .option('--target <path>', 'target directory (default: .claude in cwd)')
  .option('--verbose', 'verbose output', false)
  .action(async (opts) => {
    const logger = makeLogger(opts);
    const target = opts.target || path.resolve(process.cwd(), '.claude');
    await installed({ target, logger });
  });

program.parseAsync(process.argv).catch((err) => {
  const logger = createLogger();
  logger.error(err.message || String(err));
  process.exit(1);
});

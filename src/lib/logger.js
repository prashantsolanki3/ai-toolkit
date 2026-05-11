import chalk from 'chalk';

export function createLogger(opts = {}) {
  const verbose = Boolean(opts.verbose);
  const useColor =
    opts.color !== undefined ? Boolean(opts.color) : process.env.NO_COLOR == null;
  const write = opts.write || ((msg) => process.stdout.write(msg + '\n'));

  const paint = (style, text) => (useColor ? style(text) : text);

  return {
    info(msg) {
      write(msg);
    },
    success(msg) {
      write(`${paint(chalk.green, '✓')} ${msg}`);
    },
    warn(msg) {
      write(`${paint(chalk.yellow, '⚠ warn:')} ${msg}`);
    },
    error(msg) {
      write(`${paint(chalk.red, '✗ error:')} ${msg}`);
    },
    dryRun(msg) {
      write(`${paint(chalk.cyan, '[dry-run]')} would ${msg}`);
    },
    verbose(msg) {
      if (verbose) write(`${paint(chalk.gray, '·')} ${msg}`);
    },
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../src/lib/logger.js';

function captureLogger(opts = {}) {
  const lines = [];
  const logger = createLogger({
    color: false,
    ...opts,
    write: (msg) => lines.push(msg),
  });
  return { logger, lines };
}

test('info() writes plain message', () => {
  const { logger, lines } = captureLogger();
  logger.info('hello');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /hello/);
});

test('success() writes a tagged message', () => {
  const { logger, lines } = captureLogger();
  logger.success('done');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /done/);
  assert.match(lines[0], /✓|success|OK/i);
});

test('warn() writes a tagged warning', () => {
  const { logger, lines } = captureLogger();
  logger.warn('careful');
  assert.match(lines[0], /careful/);
  assert.match(lines[0], /warn|⚠/i);
});

test('error() writes a tagged error', () => {
  const { logger, lines } = captureLogger();
  logger.error('broken');
  assert.match(lines[0], /broken/);
  assert.match(lines[0], /error|✗|✖/i);
});

test('dryRun() writes a "would" message', () => {
  const { logger, lines } = captureLogger();
  logger.dryRun('install x');
  assert.match(lines[0], /install x/);
  assert.match(lines[0], /dry|would/i);
});

test('verbose() suppresses when verbose flag is false', () => {
  const { logger, lines } = captureLogger({ verbose: false });
  logger.verbose('details');
  assert.equal(lines.length, 0);
});

test('verbose() emits when verbose flag is true', () => {
  const { logger, lines } = captureLogger({ verbose: true });
  logger.verbose('details');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /details/);
});

test('color: false produces no ANSI escape codes', () => {
  const { logger, lines } = captureLogger({ color: false });
  logger.success('clean');
  // Strip nothing — just check no escape codes
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(lines[0], /\[/);
});

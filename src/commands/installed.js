import { read as readLockfile } from '../lib/lockfile.js';
import { createLogger } from '../lib/logger.js';

const ASSET_TYPES = ['skills', 'agents', 'commands', 'hooks', 'rules'];

export async function installed(opts = {}) {
  const logger = opts.logger || createLogger();
  const target = opts.target;
  if (!target) throw new Error('installed: missing target');

  const lockfile = readLockfile(target);
  if (!lockfile) {
    logger.info(`Nothing installed at ${target} (no lockfile).`);
    return { lockfile: null };
  }

  logger.info(`Tool:    ${lockfile.tool || '(unknown)'}`);
  logger.info(`Scope:   ${lockfile.scope || '(unknown)'}`);
  if (lockfile.preset) logger.info(`Preset:  ${lockfile.preset}`);
  if (lockfile.source) logger.info(`Source:  ${lockfile.source}`);
  if (lockfile.lastUpdatedAt) logger.info(`Updated: ${lockfile.lastUpdatedAt}`);
  logger.info('');

  let total = 0;
  for (const type of ASSET_TYPES) {
    const tracked = (lockfile.assets && lockfile.assets[type]) || {};
    const names = Object.keys(tracked);
    if (names.length === 0) continue;
    logger.info(`${type} (${names.length}):`);
    for (const name of names) {
      const shortSha = (tracked[name].sha || '').slice(0, 12);
      logger.info(`  ${name}${shortSha ? `  [${shortSha}]` : ''}`);
      total += 1;
    }
  }
  if (total === 0) {
    logger.info('Lockfile present but tracks no assets.');
  }
  return { lockfile };
}

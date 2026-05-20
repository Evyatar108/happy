import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { loadConfig } from '../../../scripts/lib/resolve-config.mjs';

import { SnapshotReader } from './snapshot-reader.js';

export interface ServerContext {
  repoRoot: string;
  config: ReturnType<typeof loadConfig>;
  snapshotReader: SnapshotReader;
}

export function buildContext(repoRoot = resolveRepoRoot(process.cwd())): ServerContext {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const config = loadConfig({ repoRoot: resolvedRepoRoot });

  return {
    repoRoot: resolvedRepoRoot,
    config,
    snapshotReader: new SnapshotReader(config),
  };
}

function resolveRepoRoot(cwd: string): string {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { loadConfig } from '../../../scripts/lib/resolve-config.mjs';

export interface ServerContext {
  repoRoot: string;
  config: ReturnType<typeof loadConfig>;
}

export function buildContext(repoRoot = resolveRepoRoot(process.cwd())): ServerContext {
  const resolvedRepoRoot = path.resolve(repoRoot);

  return {
    repoRoot: resolvedRepoRoot,
    config: loadConfig({ repoRoot: resolvedRepoRoot }),
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

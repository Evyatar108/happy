import { describe, expect, it, vi } from 'vitest';

import type { Metadata } from '@/api/types';
import { HAPPY_FORKED_FROM_SESSION_ID } from '@/utils/envNames';
import type { TrackedSession } from './types';
import { FORK_ENV_DENYLIST_PATTERN, forkSession } from './forkSession';

const PARENT_REPO_ROOT = '/parent';
const defaultRealpath = (p: string) => Promise.resolve(p);
const defaultRunGit = async (_cwd: string, args: string[]): Promise<string> => {
  if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
    return `${PARENT_REPO_ROOT}\n`;
  }
  if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
    return [
      `worktree ${PARENT_REPO_ROOT}`,
      'HEAD 0000000000000000000000000000000000000000',
      'branch refs/heads/main',
      '',
      'worktree /fork/worktree',
      'HEAD 0000000000000000000000000000000000000000',
      'branch refs/heads/fork',
      '',
    ].join('\n');
  }
  return '';
};

function codexMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    path: '/parent/worktree',
    host: 'test-host',
    homeDir: '/home/test',
    happyHomeDir: '/home/test/.happy',
    happyLibDir: '/happy/lib',
    happyToolsDir: '/happy/tools',
    flavor: 'codex',
    codexThreadId: 'thread-parent',
    ...overrides,
  };
}

function trackedSession(metadata: Metadata = codexMetadata()): TrackedSession {
  return {
    startedBy: 'daemon',
    happySessionId: 'parent-local-id',
    happySessionMetadataFromLocalWebhook: metadata,
    encryption: {
      encryptionKey: new Uint8Array([1, 2, 3]),
      encryptionVariant: 'legacy',
      seq: 7,
      metadataVersion: 11,
      agentStateVersion: 13,
    },
    pid: 123,
  };
}

describe('forkSession', () => {
  it('spawns a fresh Codex resume launch in the chosen worktree with fork env only', async () => {
    const parent = trackedSession();
    const spawnTrackedHappyProcess = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'fork-child-id' });

    const result = await forkSession({
      parentSessionId: 'parent-local-id',
      worktreePath: '/fork/worktree',
      model: 'gpt-5.2-codex',
      permissionMode: 'safe-yolo',
      effortLevel: 'high',
    }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess,
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {
        PATH: '/bin',
        HAPPY_RECONNECT_SESSION_ID: 'old-session',
        HAPPY_RECONNECT_ENCRYPTION_KEY: 'old-key',
      },
    });

    expect(result).toEqual({ type: 'success', sessionId: 'fork-child-id' });
    expect(spawnTrackedHappyProcess).toHaveBeenCalledTimes(1);
    const launch = spawnTrackedHappyProcess.mock.calls[0][0];
    expect(launch.cwd).toBe('/fork/worktree');
    expect(launch.args).toEqual([
      'codex', '--resume', 'thread-parent',
      '--started-by', 'daemon',
      '--effort', 'high',
      '--model', 'gpt-5.2-codex',
      '--permission-mode', 'safe-yolo',
    ]);
    expect(launch.env[HAPPY_FORKED_FROM_SESSION_ID]).toBe('parent-local-id');
    expect(Object.keys(launch.env).filter(key => key.startsWith('HAPPY_RECONNECT_'))).toHaveLength(0);
  });

  it('always fetches server metadata and prefers fresh codexThreadId over stale cached one', async () => {
    const parent = trackedSession(codexMetadata({ codexThreadId: 'stale-thread' }));
    const spawnTrackedHappyProcess = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'fork-child-id' });
    const fetchServerSessionMetadata = vi.fn().mockResolvedValue(codexMetadata({ codexThreadId: 'fresh-thread' }));

    await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata,
      spawnTrackedHappyProcess,
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });

    expect(fetchServerSessionMetadata).toHaveBeenCalledTimes(1);
    expect(fetchServerSessionMetadata).toHaveBeenCalledWith('parent-local-id', parent.encryption!.encryptionKey, 'legacy');
    expect(spawnTrackedHappyProcess.mock.calls[0][0].args).toContain('fresh-thread');
    expect(spawnTrackedHappyProcess.mock.calls[0][0].args).not.toContain('stale-thread');
  });

  it('falls back to local cached codexThreadId when server fetch fails', async () => {
    const parent = trackedSession(codexMetadata({ codexThreadId: 'cached-thread' }));
    const spawnTrackedHappyProcess = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'fork-child-id' });
    const fetchServerSessionMetadata = vi.fn().mockRejectedValue(new Error('network error'));

    await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata,
      spawnTrackedHappyProcess,
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });

    expect(fetchServerSessionMetadata).toHaveBeenCalledTimes(1);
    expect(spawnTrackedHappyProcess.mock.calls[0][0].args).toContain('cached-thread');
  });

  it('fetches fresh metadata when the webhook has Codex flavor but no thread id', async () => {
    const parent = trackedSession(codexMetadata({ codexThreadId: undefined }));
    const spawnTrackedHappyProcess = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'fork-child-id' });
    const fetchServerSessionMetadata = vi.fn().mockResolvedValue(codexMetadata({ codexThreadId: 'fresh-thread' }));

    await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata,
      spawnTrackedHappyProcess,
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });

    expect(fetchServerSessionMetadata).toHaveBeenCalledWith('parent-local-id', parent.encryption!.encryptionKey, 'legacy');
    expect(spawnTrackedHappyProcess.mock.calls[0][0].args).toContain('fresh-thread');
  });

  it('returns error envelopes for missing parent, missing worktree, and non-Codex parent', async () => {
    const parentMissing = await forkSession({ parentSessionId: 'missing', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(undefined),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn(),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });
    expect(parentMissing.type).toBe('error');
    expect(parentMissing).toMatchObject({ errorMessage: expect.stringContaining('not tracked') });

    const worktreeMissing = await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/missing/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(trackedSession()),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });
    expect(worktreeMissing.type).toBe('error');
    expect(worktreeMissing).toMatchObject({ errorMessage: expect.stringContaining('ENOENT') });

    const flavorUnsupported = await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(trackedSession(codexMetadata({ flavor: 'claude', codexThreadId: undefined }))),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn(),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });
    expect(flavorUnsupported.type).toBe('error');
    expect(flavorUnsupported).toMatchObject({ errorMessage: expect.stringContaining('Codex sessions only') });
  });

  it('returns error when worktreePath is not absolute', async () => {
    const result = await forkSession({ parentSessionId: 'parent-local-id', worktreePath: 'relative/path' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(trackedSession()),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn(),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });
    expect(result.type).toBe('error');
    expect(result).toMatchObject({ errorMessage: expect.stringContaining('absolute path') });
  });

  it('returns error when worktreePath stat is not a directory', async () => {
    const result = await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree/file.txt' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(trackedSession()),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });
    expect(result.type).toBe('error');
    expect(result).toMatchObject({ errorMessage: expect.stringContaining('directory') });
  });

  it('passes through approval-request envelopes returned by the spawner', async () => {
    const result = await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(trackedSession()),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn().mockResolvedValue({ type: 'requestToApproveDirectoryCreation', directory: '/fork/worktree' }),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {},
    });

    expect(result).toEqual({ type: 'requestToApproveDirectoryCreation', directory: '/fork/worktree' });
  });

  it('strips every env var matching the fork denylist pattern (HAPPY_RECONNECT_*, HAPPY_DAEMON_PRIVATE_*)', async () => {
    expect(FORK_ENV_DENYLIST_PATTERN.test('HAPPY_RECONNECT_SESSION_ID')).toBe(true);
    expect(FORK_ENV_DENYLIST_PATTERN.test('HAPPY_RECONNECT_ENCRYPTION_KEY')).toBe(true);
    expect(FORK_ENV_DENYLIST_PATTERN.test('HAPPY_DAEMON_PRIVATE_TOKEN')).toBe(true);
    expect(FORK_ENV_DENYLIST_PATTERN.test('HAPPY_DAEMON_PRIVATE_FUTURE_KEY')).toBe(true);
    expect(FORK_ENV_DENYLIST_PATTERN.test('HAPPY_OTHER_VAR')).toBe(false);
    expect(FORK_ENV_DENYLIST_PATTERN.test('PATH')).toBe(false);

    const parent = trackedSession();
    const spawnTrackedHappyProcess = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'fork-child-id' });

    await forkSession({ parentSessionId: 'parent-local-id', worktreePath: '/fork/worktree' }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess,
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit: vi.fn(defaultRunGit),
      baseEnv: {
        PATH: '/bin',
        HAPPY_RECONNECT_SESSION_ID: 'old-session',
        HAPPY_RECONNECT_ENCRYPTION_KEY: 'old-key',
        HAPPY_DAEMON_PRIVATE_TOKEN: 'private-token',
        HAPPY_DAEMON_PRIVATE_FUTURE_KEY: 'future',
        HAPPY_OTHER_VAR: 'kept',
      },
    });

    const launchEnv = spawnTrackedHappyProcess.mock.calls[0][0].env;
    expect(Object.keys(launchEnv).filter((key: string) => FORK_ENV_DENYLIST_PATTERN.test(key))).toHaveLength(0);
    expect(launchEnv.HAPPY_RECONNECT_SESSION_ID).toBeUndefined();
    expect(launchEnv.HAPPY_RECONNECT_ENCRYPTION_KEY).toBeUndefined();
    expect(launchEnv.HAPPY_DAEMON_PRIVATE_TOKEN).toBeUndefined();
    expect(launchEnv.HAPPY_DAEMON_PRIVATE_FUTURE_KEY).toBeUndefined();
    expect(launchEnv.HAPPY_OTHER_VAR).toBe('kept');
    expect(launchEnv.PATH).toBe('/bin');
    expect(launchEnv[HAPPY_FORKED_FROM_SESSION_ID]).toBe('parent-local-id');
  });

  it('rejects an absolute worktree directory outside the parent repo and not registered as a worktree', async () => {
    const parent = trackedSession();
    const runGit = vi.fn(async (_cwd: string, args: string[]): Promise<string> => {
      if (args[0] === 'rev-parse') return `${PARENT_REPO_ROOT}\n`;
      if (args[0] === 'worktree') {
        return [
          `worktree ${PARENT_REPO_ROOT}`,
          'HEAD 0000000000000000000000000000000000000000',
          'branch refs/heads/main',
          '',
        ].join('\n');
      }
      return '';
    });

    const result = await forkSession({
      parentSessionId: 'parent-local-id',
      worktreePath: '/etc/elsewhere',
    }, {
      findTrackedSessionById: vi.fn().mockReturnValue(parent),
      fetchServerSessionMetadata: vi.fn(),
      spawnTrackedHappyProcess: vi.fn(),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      realpath: vi.fn(defaultRealpath),
      runGit,
      baseEnv: {},
    });

    expect(result.type).toBe('error');
    expect(result).toMatchObject({ errorMessage: expect.stringContaining('not a registered worktree') });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockAuthAndSetupMachineIfNeeded: vi.fn(),
  mockRunCodex: vi.fn(),
  mockExtractCodexEffortFlag: vi.fn(),
  mockExtractCodexModelFlag: vi.fn(),
  mockExtractCodexPermissionModeFlag: vi.fn(),
  mockExtractCodexResumeFlag: vi.fn(),
  mockExtractCodexTransportFlag: vi.fn(),
  mockExtractNoSandboxFlag: vi.fn(),
  mockEnsureDaemonRunning: vi.fn(),
}))

vi.mock('@/ui/auth', () => ({
  authAndSetupMachineIfNeeded: mocks.mockAuthAndSetupMachineIfNeeded,
}))

vi.mock('@/codex/runCodex', () => ({
  runCodex: mocks.mockRunCodex,
}))

vi.mock('@/codex/cliArgs', () => ({
  extractCodexEffortFlag: mocks.mockExtractCodexEffortFlag,
  extractCodexModelFlag: mocks.mockExtractCodexModelFlag,
  extractCodexPermissionModeFlag: mocks.mockExtractCodexPermissionModeFlag,
  extractCodexResumeFlag: mocks.mockExtractCodexResumeFlag,
  extractCodexTransportFlag: mocks.mockExtractCodexTransportFlag,
}))

vi.mock('@/utils/sandboxFlags', () => ({
  extractNoSandboxFlag: mocks.mockExtractNoSandboxFlag,
}))

vi.mock('@/daemon/ensureDaemonRunning', () => ({
  ensureDaemonRunning: mocks.mockEnsureDaemonRunning,
}))

import { handleCodexCommand } from './codexCommand'

describe('handleCodexCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAuthAndSetupMachineIfNeeded.mockResolvedValue({
      credentials: { token: 'token' },
    })
    mocks.mockExtractNoSandboxFlag.mockImplementation((args: string[]) => ({
      noSandbox: false,
      args,
    }))
    mocks.mockExtractCodexResumeFlag.mockImplementation((args: string[]) => ({
      resumeThreadId: null,
      args,
    }))
    mocks.mockExtractCodexEffortFlag.mockImplementation((args: string[]) => ({
      effortLevel: undefined,
      args,
    }))
    mocks.mockExtractCodexModelFlag.mockImplementation((args: string[]) => ({
      model: undefined,
      args,
    }))
    mocks.mockExtractCodexPermissionModeFlag.mockImplementation((args: string[]) => ({
      permissionMode: undefined,
      args,
    }))
    mocks.mockExtractCodexTransportFlag.mockImplementation((args: string[]) => ({
      transport: undefined,
      args,
    }))
    mocks.mockEnsureDaemonRunning.mockResolvedValue(undefined)
    mocks.mockRunCodex.mockResolvedValue(undefined)
  })

  it('ensures the daemon is running before starting a codex session', async () => {
    await handleCodexCommand(['--started-by', 'terminal'])

    expect(mocks.mockEnsureDaemonRunning).toHaveBeenCalledTimes(1)
    expect(mocks.mockRunCodex).toHaveBeenCalledWith({
      credentials: { token: 'token' },
      startedBy: 'terminal',
      noSandbox: false,
      resumeThreadId: undefined,
      effortLevel: undefined,
      model: undefined,
      permissionMode: undefined,
      codexTransport: undefined,
    })
    expect(
      mocks.mockEnsureDaemonRunning.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.mockRunCodex.mock.invocationCallOrder[0])
  })

  it('passes parsed no-sandbox and resume flags through to runCodex', async () => {
    mocks.mockExtractNoSandboxFlag.mockReturnValue({
      noSandbox: true,
      args: ['--resume', 'thread-123', '--started-by', 'daemon'],
    })
    mocks.mockExtractCodexResumeFlag.mockReturnValue({
      resumeThreadId: 'thread-123',
      args: ['--effort', 'high', '--codex-transport', 'ws', '--started-by', 'daemon'],
    })
    mocks.mockExtractCodexEffortFlag.mockReturnValue({
      effortLevel: 'high',
      args: ['--model', 'o3', '--codex-transport', 'ws', '--started-by', 'daemon'],
    })
    mocks.mockExtractCodexModelFlag.mockReturnValue({
      model: 'o3',
      args: ['--permission-mode', 'safe-yolo', '--codex-transport', 'ws', '--started-by', 'daemon'],
    })
    mocks.mockExtractCodexPermissionModeFlag.mockReturnValue({
      permissionMode: 'safe-yolo',
      args: ['--codex-transport', 'ws', '--started-by', 'daemon'],
    })
    mocks.mockExtractCodexTransportFlag.mockReturnValue({
      transport: 'ws',
      args: ['--started-by', 'daemon'],
    })

    await handleCodexCommand(['--no-sandbox', '--resume', 'thread-123', '--model', 'o3', '--permission-mode', 'safe-yolo', '--codex-transport', 'ws', '--started-by', 'daemon'])

    expect(mocks.mockRunCodex).toHaveBeenCalledWith({
      credentials: { token: 'token' },
      startedBy: 'daemon',
      noSandbox: true,
      resumeThreadId: 'thread-123',
      effortLevel: 'high',
      model: 'o3',
      permissionMode: 'safe-yolo',
      codexTransport: 'ws',
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkIfDaemonRunningAndCleanupStaleState: vi.fn(),
  readDaemonState: vi.fn(),
  readMachineState: vi.fn(),
}));

vi.mock('@/daemon/controlClient', () => ({
  checkIfDaemonRunningAndCleanupStaleState: mocks.checkIfDaemonRunningAndCleanupStaleState,
}));

vi.mock('@/persistence', () => ({
  readSettings: vi.fn(),
  readCredentials: vi.fn(),
  readDaemonState: mocks.readDaemonState,
  readMachineState: mocks.readMachineState,
}));

describe('runDoctorDaemon', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.checkIfDaemonRunningAndCleanupStaleState.mockReset();
    mocks.readDaemonState.mockReset();
    mocks.readMachineState.mockReset();
  });

  it('prints daemon and machine status in a stable order', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T01:00:00.000Z'));
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line = '') => output.push(String(line)));
    mocks.checkIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true);
    mocks.readDaemonState.mockResolvedValue({
      pid: 1234,
      httpPort: 4555,
      startTime: new Date('2026-05-12T00:58:30.000Z').toISOString(),
      startedWithCliVersion: '1.2.3',
      daemonLogPath: '/tmp/happy.log',
    });
    mocks.readMachineState.mockResolvedValue({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62001,
      tunnelId: 'happy-machine-1',
      lastTunnelUrl: 'https://happy-machine-1.devtunnels.ms',
    });

    const { runDoctorDaemon } = await import('./doctor');
    await runDoctorDaemon();

    expect(stripAnsi(output)).toEqual([
      'Daemon running (PID: 1234)',
      '  Version: 1.2.3',
      '  Uptime: 1m 30s',
      '  Machine ID: machine-1',
      '  Tunnel Port: 62000',
      '  Loopback Port: 62001',
      '  Tunnel URL: https://happy-machine-1.devtunnels.ms',
      '  HTTP Control Port: 4555',
      '  Log: /tmp/happy.log',
    ]);
    vi.useRealTimers();
  });

  it('prints <none> for Tunnel URL when machineState exists but lastTunnelUrl is absent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T01:00:00.000Z'));
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line = '') => output.push(String(line)));
    mocks.checkIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true);
    mocks.readDaemonState.mockResolvedValue({
      pid: 1234,
      httpPort: 4555,
      startTime: new Date('2026-05-12T00:58:30.000Z').toISOString(),
      startedWithCliVersion: '1.2.3',
      daemonLogPath: '/tmp/happy.log',
    });
    mocks.readMachineState.mockResolvedValue({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62001,
      tunnelId: 'happy-machine-1',
      lastTunnelUrl: null,
    });

    const { runDoctorDaemon } = await import('./doctor');
    await runDoctorDaemon();

    expect(stripAnsi(output)).toEqual([
      'Daemon running (PID: 1234)',
      '  Version: 1.2.3',
      '  Uptime: 1m 30s',
      '  Machine ID: machine-1',
      '  Tunnel Port: 62000',
      '  Loopback Port: 62001',
      '  Tunnel URL: <none>',
      '  HTTP Control Port: 4555',
      '  Log: /tmp/happy.log',
    ]);
    vi.useRealTimers();
  });

  it('keeps machine-sourced lines when machine.json is missing', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line = '') => output.push(String(line)));
    mocks.checkIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true);
    mocks.readDaemonState.mockResolvedValue({
      pid: 1234,
      httpPort: 4555,
      startTime: 'not-a-date',
      startedWithCliVersion: '1.2.3',
    });
    mocks.readMachineState.mockResolvedValue(null);

    const { runDoctorDaemon } = await import('./doctor');
    await runDoctorDaemon();

    expect(stripAnsi(output).slice(0, 9)).toEqual([
      'Daemon running (PID: 1234)',
      '  Version: 1.2.3',
      '  Uptime: <unknown>',
      '  Machine ID: <unknown>',
      '  Tunnel Port: <unknown>',
      '  Loopback Port: <unknown>',
      '  Tunnel URL: <unknown>',
      '  HTTP Control Port: 4555',
      '  Log: <unknown>',
    ]);
  });
});

function stripAnsi(lines: string[]): string[] {
  return lines.map(line => line.replace(/\u001b\[[0-9;]*m/g, ''));
}

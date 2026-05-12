import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockLoopbackFetch } = vi.hoisted(() => ({
  mockLoopbackFetch: vi.fn(),
}));

vi.mock('@/daemon/daemonClient', () => ({
  loopbackFetch: mockLoopbackFetch,
}));

describe('account settings client', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads settings through the daemon loopback endpoint', async () => {
    mockLoopbackFetch.mockResolvedValueOnce(new Response(JSON.stringify({ theme: 'contrast' }), { status: 200 }));
    const { readAccountSettings } = await import('./accountSettings');

    await expect(readAccountSettings()).resolves.toEqual({ theme: 'contrast' });
    expect(mockLoopbackFetch).toHaveBeenCalledWith('/v2/me/settings');
  });

  it('writes settings through the daemon loopback endpoint', async () => {
    mockLoopbackFetch.mockResolvedValueOnce(new Response(JSON.stringify({ alerts: true }), { status: 200 }));
    const { writeAccountSettings } = await import('./accountSettings');

    await expect(writeAccountSettings({ alerts: true })).resolves.toEqual({ alerts: true });
    expect(mockLoopbackFetch).toHaveBeenCalledWith('/v2/me/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts: true }),
    });
  });
});


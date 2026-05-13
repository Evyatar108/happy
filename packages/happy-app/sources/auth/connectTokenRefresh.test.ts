import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const secureStore = vi.hoisted(() => ({
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
    getConnectToken: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@/sync/tunnelProvider', () => ({
    DevTunnelsClientProvider: vi.fn(() => ({ getConnectToken: providerMocks.getConnectToken })),
}));

import { ensureFreshConnectToken } from './connectTokenRefresh';
import { TokenStorage, type AuthCredentials } from './tokenStorage';

function machine(overrides: Partial<AuthCredentials> = {}): AuthCredentials {
    return {
        machineId: 'machine-1',
        tunnelId: 'tunnel-1',
        tunnelUrl: 'https://machine.example.test',
        firstSeenAt: 1,
        ...overrides,
    };
}

describe('ensureFreshConnectToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        providerMocks.getConnectToken.mockResolvedValue('fresh-connect');
    });

    it('returns cached connect token when expiry is more than 60s away', async () => {
        await expect(ensureFreshConnectToken(machine({ connectToken: 'cached', connectTokenExpiry: Date.now() + 120_000 })))
            .resolves.toMatchObject({ connectToken: 'cached' });
        expect(providerMocks.getConnectToken).not.toHaveBeenCalled();
    });

    it('refreshes stale tokens and preserves a non-primary machine selection', async () => {
        const primary = machine({ machineId: 'machine-primary', tunnelId: 'tunnel-primary', connectToken: 'primary-token', connectTokenExpiry: Date.now() + 120_000 });
        const secondary = machine({ machineId: 'machine-secondary', tunnelId: 'tunnel-secondary', connectToken: 'old', connectTokenExpiry: Date.now() + 1_000 });
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: 'machine-primary',
            machines: [primary, secondary],
            devTunnelsAccess: 'ghu-token',
        }));

        const result = await ensureFreshConnectToken(secondary);

        expect(result.connectToken).toBe('fresh-connect');
        expect(providerMocks.getConnectToken).toHaveBeenCalledOnce();
        expect(providerMocks.getConnectToken).toHaveBeenCalledWith('tunnel-secondary');
        const stored = JSON.parse(secureStore.setItemAsync.mock.calls.at(-1)![1]);
        expect(stored.primaryMachineId).toBe('machine-primary');
        expect(stored.devTunnelsAccess).toBe('ghu-token');
        expect(stored.machines.find((item: AuthCredentials) => item.machineId === 'machine-secondary').connectToken).toBe('fresh-connect');
    });

    it('serializes concurrent refreshes for one machine', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: 'machine-1',
            machines: [machine()],
            devTunnelsAccess: 'ghu-token',
        }));

        await Promise.all([ensureFreshConnectToken(machine()), ensureFreshConnectToken(machine())]);

        expect(providerMocks.getConnectToken).toHaveBeenCalledOnce();
    });

    it('does not serialize different machines behind one provider request', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: 'machine-1',
            machines: [machine(), machine({ machineId: 'machine-2', tunnelId: 'tunnel-2' })],
            devTunnelsAccess: 'ghu-token',
        }));

        await Promise.all([
            ensureFreshConnectToken(machine()),
            ensureFreshConnectToken(machine({ machineId: 'machine-2', tunnelId: 'tunnel-2' })),
        ]);

        expect(providerMocks.getConnectToken).toHaveBeenCalledTimes(2);
    });

    it('keeps the helper acyclic from machineAuth and refreshClaim', () => {
        const source = readFileSync(resolve(__dirname, 'connectTokenRefresh.ts'), 'utf8');
        expect(source).not.toContain('@/auth/machineAuth');
        expect(source).not.toContain('@/sync/refreshClaim');
    });
});

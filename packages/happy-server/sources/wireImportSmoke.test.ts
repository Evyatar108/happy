import { describe, expect, it } from 'vitest';
import { MachineTunnelSchema } from '@slopus/happy-wire';

describe('happy-wire root imports', () => {
    it('resolves MachineTunnelSchema from happy-server', () => {
        expect(MachineTunnelSchema.parse({
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            url: 'https://tunnel.example.com',
            tags: ['happy-machine'],
            lastSeenAt: 1778527800000,
            owner: 'evy',
        }).machineId).toBe('machine-1');
    });
});

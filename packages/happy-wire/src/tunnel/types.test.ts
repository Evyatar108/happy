import { describe, expect, it } from 'vitest';
import { MachineTunnelSchema } from '../index';

describe('MachineTunnelSchema', () => {
  it('parses a valid machine tunnel imported from the package root', () => {
    const value = {
      machineId: 'machine-1',
      tunnelId: 'tunnel-1',
      url: 'https://tunnel.example.com',
      tags: ['happy-machine', 'owner:evy'],
      lastSeenAt: '2026-05-11T11:30:00.000Z',
      owner: 'evy',
    };

    expect(MachineTunnelSchema.parse(value)).toEqual(value);
  });
});

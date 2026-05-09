import { describe, expect, it } from 'vitest';
import { TofuHandshakeMessageSchema, TofuPubkeysEventSchema, TofuSessionKeyExchangeSchema } from './tofu';

describe('TOFU handshake schemas', () => {
  it('parses pubkey publication from the server handshake', () => {
    const parsed = TofuPubkeysEventSchema.safeParse({
      t: 'tofu-pubkeys',
      keys: {
        ed25519PublicKey: 'ed25519-public-key-base64url',
        x25519PublicKey: 'x25519-public-key-base64url',
        ed25519Fingerprint: 'SHA256:abc123',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('parses session key exchange metadata', () => {
    const parsed = TofuSessionKeyExchangeSchema.safeParse({
      t: 'tofu-session-key',
      machineId: 'machine-1',
      mobileX25519PublicKey: 'mobile-x25519-public-key-base64url',
      serverX25519PublicKey: 'server-x25519-public-key-base64url',
      sessionKey: 'derived-session-key-base64url',
      firstSeenAt: 1778300000000,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects malformed TOFU messages', () => {
    expect(TofuHandshakeMessageSchema.safeParse({
      t: 'tofu-pubkeys',
      keys: { ed25519PublicKey: 'ed', x25519PublicKey: '' },
    }).success).toBe(false);
    expect(TofuHandshakeMessageSchema.safeParse({
      t: 'tofu-session-key',
      machineId: 'machine-1',
      sessionKey: 'key',
    }).success).toBe(false);
  });
});

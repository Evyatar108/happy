import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';

import { getLocalTunnelClaim } from './getLocalTunnelClaim';

ed.hashes.sha512 = (message: Uint8Array) => sha512(message);

describe('getLocalTunnelClaim', () => {
  it('returns a tunnel-prefixed signed envelope with exp and jti', async () => {
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);

    const claim = await getLocalTunnelClaim({ machineId: 'machine-1', ed25519PrivateKey: privateKey });

    expect(claim.startsWith('tunnel ')).toBe(true);
    const encoded = claim.slice('tunnel '.length);
    const envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as { p: string; s: string };
    expect(envelope).toEqual({ p: expect.any(String), s: expect.stringMatching(/^[0-9a-f]+$/) });

    const payload = JSON.parse(Buffer.from(envelope.p, 'base64url').toString('utf-8')) as {
      sub: string;
      iat: number;
      exp: number;
      jti: string;
    };
    expect(payload.sub).toBe('machine-1');
    expect(payload.exp).toBe(payload.iat + 3600);
    expect(payload.jti).toEqual(expect.any(String));
    await expect(ed.verifyAsync(Buffer.from(envelope.s, 'hex'), Buffer.from(envelope.p), publicKey)).resolves.toBe(true);
  });
});

import { randomUUID } from 'node:crypto';

import { encodeTunnelClaim } from 'happy-server';

export interface LocalTunnelClaimInput {
  machineId: string;
  ed25519PrivateKey: Uint8Array;
}

export async function getLocalTunnelClaim(input: LocalTunnelClaimInput): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: input.machineId,
    iat: issuedAt,
    exp: issuedAt + 3600,
    jti: randomUUID(),
  };
  const encoded = await encodeTunnelClaim(payload, input.ed25519PrivateKey);
  return `tunnel ${encoded}`;
}

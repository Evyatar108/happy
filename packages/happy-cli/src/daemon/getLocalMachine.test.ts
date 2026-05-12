import { describe, expect, it } from 'vitest';
import { decodeBase64, decrypt } from '@/api/encryption';
import type { Credentials } from '@/persistence';
import { getLocalMachine } from './getLocalMachine';

const metadata = {
  host: 'host-1',
  platform: 'test',
  happyCliVersion: '1.2.3',
  homeDir: '/home/test',
  happyHomeDir: '/home/test/.happy',
  happyLibDir: '/happy',
};

describe('getLocalMachine', () => {
  it('reconstructs a version-1 data-key machine and encrypted bootstrap payload', () => {
    const credentials: Credentials = {
      token: 'token',
      encryption: {
        type: 'dataKey',
        publicKey: new Uint8Array(32).fill(2),
        machineKey: new Uint8Array(32).fill(3),
      },
    };
    const daemonState = { status: 'running', pid: 123, httpPort: 456, startedAt: 1 } as const;

    const result = getLocalMachine({ credentials, machineId: 'machine-1', metadata, daemonState });

    expect(result.machine).toMatchObject({
      id: 'machine-1',
      encryptionVariant: 'dataKey',
      metadata,
      metadataVersion: 1,
      daemonState,
      daemonStateVersion: 1,
    });
    expect(result.machine).not.toHaveProperty('version');
    expect(result.dataEncryptionKeyBase64).toEqual(expect.any(String));
    expect(decrypt(result.machine.encryptionKey, result.machine.encryptionVariant, decodeBase64(result.encryptedMetadata))).toEqual(metadata);
    expect(decrypt(result.machine.encryptionKey, result.machine.encryptionVariant, decodeBase64(result.encryptedDaemonState!))).toEqual(daemonState);
  });

  it('reconstructs a legacy machine with no data encryption key', () => {
    const credentials: Credentials = {
      token: 'token',
      encryption: { type: 'legacy', secret: new Uint8Array(32).fill(4) },
    };

    const result = getLocalMachine({ credentials, machineId: 'machine-legacy', metadata });

    expect(result.machine).toMatchObject({
      id: 'machine-legacy',
      encryptionVariant: 'legacy',
      metadataVersion: 1,
      daemonState: null,
      daemonStateVersion: 1,
    });
    expect(result.dataEncryptionKeyBase64).toBeNull();
    expect(result.encryptedDaemonState).toBeNull();
  });
});

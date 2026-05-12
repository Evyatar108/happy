import type { Machine, MachineMetadata, DaemonState } from '@/api/types';
import { encodeBase64, encrypt, libsodiumEncryptForPublicKey } from '@/api/encryption';
import type { Credentials } from '@/persistence';

export interface LocalMachineBootstrap {
  machine: Machine;
  encryptedMetadata: string;
  encryptedDaemonState: string | null;
  dataEncryptionKeyBase64: string | null;
}

export function getLocalMachine(input: {
  credentials: Credentials;
  machineId: string;
  metadata: MachineMetadata;
  daemonState?: DaemonState | null;
}): LocalMachineBootstrap {
  let encryptionKey: Uint8Array;
  let encryptionVariant: 'legacy' | 'dataKey';
  let dataEncryptionKey: Uint8Array | null = null;

  if (input.credentials.encryption.type === 'dataKey') {
    encryptionVariant = 'dataKey';
    encryptionKey = input.credentials.encryption.machineKey;
    const encryptedDataKey = libsodiumEncryptForPublicKey(
      input.credentials.encryption.machineKey,
      input.credentials.encryption.publicKey,
    );
    dataEncryptionKey = new Uint8Array(encryptedDataKey.length + 1);
    dataEncryptionKey.set([0], 0);
    dataEncryptionKey.set(encryptedDataKey, 1);
  } else {
    encryptionVariant = 'legacy';
    encryptionKey = input.credentials.encryption.secret;
  }

  const daemonState = input.daemonState ?? null;
  return {
    machine: {
      id: input.machineId,
      encryptionKey,
      encryptionVariant,
      metadata: input.metadata,
      metadataVersion: 1,
      daemonState,
      daemonStateVersion: 1,
    },
    encryptedMetadata: encodeBase64(encrypt(encryptionKey, encryptionVariant, input.metadata)),
    encryptedDaemonState: daemonState ? encodeBase64(encrypt(encryptionKey, encryptionVariant, daemonState)) : null,
    dataEncryptionKeyBase64: dataEncryptionKey ? encodeBase64(dataEncryptionKey) : null,
  };
}

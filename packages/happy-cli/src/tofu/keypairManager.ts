import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import nacl from 'tweetnacl';

import { encodeBase64, decodeBase64 } from '@/api/encryption';

ed.hashes.sha512 = (message: Uint8Array) => sha512(message);

export interface TofuKeypairFiles {
  ed25519PublicKeyFile: string;
  ed25519PrivateKeyFile: string;
  ecdhPublicKeyFile: string;
  ecdhPrivateKeyFile: string;
}

export interface TofuKeypairs {
  ed25519PublicKey: Uint8Array;
  ed25519PrivateKey: Uint8Array;
  ecdhPublicKey: Uint8Array;
  ecdhPrivateKey: Uint8Array;
  ed25519Fingerprint: string;
  createdEd25519: boolean;
  createdEcdh: boolean;
  files: TofuKeypairFiles;
}

function keypairFiles(happyHomeDir: string): TofuKeypairFiles {
  return {
    ed25519PublicKeyFile: join(happyHomeDir, 'server-key.pub'),
    ed25519PrivateKeyFile: join(happyHomeDir, 'server-key.priv'),
    ecdhPublicKeyFile: join(happyHomeDir, 'ecdh-key.pub'),
    ecdhPrivateKeyFile: join(happyHomeDir, 'ecdh-key.priv'),
  };
}

async function readBase64File(filePath: string): Promise<Uint8Array | null> {
  try {
    return decodeBase64((await readFile(filePath, 'utf-8')).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeBase64File(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${encodeBase64(bytes)}\n`, { mode: 0o600 });
  if (process.platform === 'win32') {
    execSync(`icacls "${filePath}" /inheritance:r /grant:r "%USERNAME%:R"`, { stdio: 'ignore' });
  } else {
    await chmod(filePath, 0o600);
  }
}

export function formatEd25519Fingerprint(publicKey: Uint8Array): string {
  const digest = createHash('sha256').update(publicKey).digest('base64').replace(/=+$/u, '');
  return `SHA256:${digest}`;
}

export async function loadOrCreateTofuKeypairs(happyHomeDir: string): Promise<TofuKeypairs> {
  const files = keypairFiles(happyHomeDir);
  let ed25519PublicKey = await readBase64File(files.ed25519PublicKeyFile);
  let ed25519PrivateKey = await readBase64File(files.ed25519PrivateKeyFile);
  let createdEd25519 = false;

  if (!ed25519PublicKey || !ed25519PrivateKey) {
    ed25519PrivateKey = ed.utils.randomSecretKey();
    ed25519PublicKey = await ed.getPublicKeyAsync(ed25519PrivateKey);
    await writeBase64File(files.ed25519PrivateKeyFile, ed25519PrivateKey);
    await writeBase64File(files.ed25519PublicKeyFile, ed25519PublicKey);
    createdEd25519 = true;
  }

  let ecdhPublicKey = await readBase64File(files.ecdhPublicKeyFile);
  let ecdhPrivateKey = await readBase64File(files.ecdhPrivateKeyFile);
  let createdEcdh = false;

  if (!ecdhPublicKey || !ecdhPrivateKey) {
    const ecdhKeypair = nacl.box.keyPair();
    ecdhPublicKey = new Uint8Array(ecdhKeypair.publicKey);
    ecdhPrivateKey = new Uint8Array(ecdhKeypair.secretKey);
    await writeBase64File(files.ecdhPrivateKeyFile, ecdhPrivateKey);
    await writeBase64File(files.ecdhPublicKeyFile, ecdhPublicKey);
    createdEcdh = true;
  }

  return {
    ed25519PublicKey,
    ed25519PrivateKey,
    ecdhPublicKey,
    ecdhPrivateKey,
    ed25519Fingerprint: formatEd25519Fingerprint(ed25519PublicKey),
    createdEd25519,
    createdEcdh,
    files,
  };
}

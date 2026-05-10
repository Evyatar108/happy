import * as nativeCrypto from 'rn-encryption';
import { decodeUTF8, encodeUTF8 } from './text';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAESKey(key64: string): Promise<CryptoKey | null> {
    if (!globalThis.crypto?.subtle) {
        return null;
    }
    return await globalThis.crypto.subtle.importKey(
        'raw',
        toArrayBuffer(decodeBase64(key64)),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptAESGCMStringWeb(data: string, key64: string): Promise<string | null> {
    const key = await importAESKey(key64);
    if (!key || !globalThis.crypto?.subtle) {
        return null;
    }
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        toArrayBuffer(encodeUTF8(data)),
    ));
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv);
    combined.set(encrypted, iv.length);
    return encodeBase64(combined);
}

async function decryptAESGCMStringWeb(data: string, key64: string): Promise<string | null> {
    const key = await importAESKey(key64);
    if (!key || !globalThis.crypto?.subtle) {
        return null;
    }
    const combined = decodeBase64(data);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        toArrayBuffer(ciphertext),
    );
    return decodeUTF8(new Uint8Array(decrypted));
}

export async function encryptAESGCMString(data: string, key64: string): Promise<string> {
    return await encryptAESGCMStringWeb(data, key64) ?? await nativeCrypto.encryptAsyncAES(data, key64);
}

export async function decryptAESGCMString(data: string, key64: string): Promise<string | null> {
    const webResult = await decryptAESGCMStringWeb(data, key64);
    if (webResult !== null) {
        return webResult;
    }
    return (await nativeCrypto.decryptAsyncAES(data, key64)).trim();
}

export async function encryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array> {
    const encrypted = (await encryptAESGCMString(decodeUTF8(data), key64)).trim();
    return decodeBase64(encrypted);
}
export async function decryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array | null> {
    let raw = await decryptAESGCMString(encodeBase64(data), key64);
    return raw ? encodeUTF8(raw) : null;
}

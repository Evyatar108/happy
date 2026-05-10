import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
    getRandomBytes: (size: number) => new Uint8Array(size).fill(7),
}));

import type { ApiMessage } from '../apiTypes';
import type { RawRecord } from '../typesRaw';
import { AES256Encryption, BoxEncryption, SecretBoxEncryption, type Decryptor, type Encryptor } from './encryptor';
import { EncryptionCache } from './encryptionCache';
import { SessionEncryption } from './sessionEncryption';

const fourMbBase64Payload = 'a'.repeat(4 * 1024 * 1024);

type UserRawRecord = Extract<RawRecord, { role: 'user' }>;

function makeKey(seed: number): Uint8Array {
    return new Uint8Array(32).fill(seed);
}

function makeRecord(): RawRecord {
    return {
        role: 'user',
        content: {
            type: 'text',
            text: 'image payload',
            attachments: [
                { type: 'image', ref: fourMbBase64Payload, mimeType: 'image/png' },
            ],
        },
        meta: {
            sentFrom: 'web',
        },
    };
}

describe('SessionEncryption large attachment payloads', () => {
    it.each([
        ['SecretBoxEncryption', () => new SecretBoxEncryption(makeKey(1))],
        ['BoxEncryption', () => new BoxEncryption(makeKey(2))],
        ['AES256Encryption', () => new AES256Encryption(makeKey(3))],
    ])('round-trips a 4 MB base64 payload through %s', async (_name, createEncryptor) => {
        const encryption = new SessionEncryption(
            'session-1',
            createEncryptor() as Encryptor & Decryptor,
            new EncryptionCache(),
        );
        const record = makeRecord();

        const encrypted = await encryption.encryptRawRecord(record);
        const decrypted = await encryption.decryptMessages([{
            id: 'message-1',
            seq: 1,
            localId: 'local-1',
            content: { t: 'encrypted', c: encrypted },
            createdAt: 1,
            updatedAt: 1,
        } satisfies ApiMessage]);

        expect(decrypted[0]?.content).toEqual(record);
        expect((decrypted[0]?.content as UserRawRecord).content.attachments?.[0]?.ref).toBe(fourMbBase64Payload);
    });
});

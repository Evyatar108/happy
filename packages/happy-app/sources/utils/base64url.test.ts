import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './base64url';

describe('base64url path encoding', () => {
    it('round-trips paths whose standard base64 contains URL-reserved characters', () => {
        const path = `/repo/${String.fromCodePoint(0x083e)}.txt`;
        const encoded = encodeBase64Url(path);

        expect(encoded).not.toMatch(/[+/=]/);
        expect(decodeBase64Url(encoded)).toBe(path);
    });

    it('decodes legacy standard base64 links', () => {
        expect(decodeBase64Url(btoa('/repo/src/file.ts'))).toBe('/repo/src/file.ts');
    });
});

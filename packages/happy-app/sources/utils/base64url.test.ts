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

    it('decodes legacy standard base64 links where + was URL-decoded to space', () => {
        // U+083E encodes to UTF-8 bytes whose base64 representation contains '+'.
        // URLSearchParams / Expo Router URL parsing replaces '+' with ' '; this
        // simulates an old-style link whose '+' was space-decoded before reaching the decoder.
        const path = `/repo/${String.fromCodePoint(0x083e)}.ts`;
        const utf8Bytes = new TextEncoder().encode(path);
        let binaryString = '';
        utf8Bytes.forEach((b) => { binaryString += String.fromCharCode(b); });
        const legacyEncoded = btoa(binaryString);
        expect(legacyEncoded).toContain('+');
        const spacedInput = legacyEncoded.replace(/\+/g, ' ');
        expect(decodeBase64Url(spacedInput)).toBe(path);
    });
});

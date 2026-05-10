import { describe, expect, it } from 'vitest';
import { dedupeAttachmentNames, sanitizeAttachmentName } from './attachmentName';

describe('attachmentName', () => {
    it('sanitizes path-shaped and reserved filenames', () => {
        expect(sanitizeAttachmentName('..%2Ffoo')).toBe('foo');
        expect(sanitizeAttachmentName('a/b.txt')).toBe('b.txt');
        expect(sanitizeAttachmentName('C:\\x.txt')).toBe('x.txt');
        expect(sanitizeAttachmentName('\u0000/')).toBe('attachment');
        expect(sanitizeAttachmentName('CON.txt')).toBe('CON_.txt');
    });

    it('dedupes collisions case-insensitively while preserving case', () => {
        expect(dedupeAttachmentNames(['name.ext', 'NAME.ext', 'name.ext'])).toEqual([
            'name.ext',
            'NAME (2).ext',
            'name (3).ext',
        ]);
    });
});

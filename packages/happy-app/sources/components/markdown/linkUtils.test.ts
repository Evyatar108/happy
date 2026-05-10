import { describe, expect, it } from 'vitest';
import { isFileMarkdownLink, isHttpMarkdownLink, INTERNAL_FILE_SCHEME, isInternalFileLinkUrl, buildInternalFileLinkUrl, parseInternalFileLinkUrl } from './linkUtils';

describe('isHttpMarkdownLink', () => {
    it('accepts http and https links', () => {
        expect(isHttpMarkdownLink('http://example.com')).toBe(true);
        expect(isHttpMarkdownLink('https://example.com/docs')).toBe(true);
        expect(isHttpMarkdownLink(' HTTPS://example.com/docs ')).toBe(true);
    });

    it('rejects non-http schemes and path-like targets', () => {
        expect(isHttpMarkdownLink('mailto:test@example.com')).toBe(false);
        expect(isHttpMarkdownLink('data:text/plain,hello')).toBe(false);
        expect(isHttpMarkdownLink('/Users/me/project/file.ts')).toBe(false);
        expect(isHttpMarkdownLink('packages/happy-app/index.tsx')).toBe(false);
    });
});

describe('isFileMarkdownLink', () => {
    it('accepts internal file links only', () => {
        expect(isFileMarkdownLink('file:abc123?line=1')).toBe(true);
        expect(isFileMarkdownLink(' FILE:abc123 ')).toBe(true);
        expect(isFileMarkdownLink('https://example.com')).toBe(false);
        expect(isFileMarkdownLink('/Users/me/project/file.ts')).toBe(false);
    });
});

describe('INTERNAL_FILE_SCHEME', () => {
    it('is happy-file:', () => {
        expect(INTERNAL_FILE_SCHEME).toBe('happy-file:');
    });
});

describe('isInternalFileLinkUrl', () => {
    it('accepts URLs starting with happy-file:', () => {
        expect(isInternalFileLinkUrl('happy-file:abc123?line=1&column=5')).toBe(true);
        expect(isInternalFileLinkUrl(' happy-file:abc123 ')).toBe(true);
    });

    it('rejects other schemes', () => {
        expect(isInternalFileLinkUrl('file:abc123?line=1')).toBe(false);
        expect(isInternalFileLinkUrl('https://example.com')).toBe(false);
        expect(isInternalFileLinkUrl('/absolute/path/file.ts')).toBe(false);
        expect(isInternalFileLinkUrl('')).toBe(false);
    });
});

describe('buildInternalFileLinkUrl and parseInternalFileLinkUrl round-trip', () => {
    it('round-trips a simple path with line and column', () => {
        const url = buildInternalFileLinkUrl('/some/session/root/file.ts', 10, 5);
        expect(url.startsWith(INTERNAL_FILE_SCHEME)).toBe(true);
        const parsed = parseInternalFileLinkUrl(url);
        expect(parsed).not.toBeNull();
        expect(parsed!.line).toBe('10');
        expect(parsed!.column).toBe('5');
    });

    it('round-trips null line and column as empty strings', () => {
        const url = buildInternalFileLinkUrl('/session/root/other.ts', null, null);
        const parsed = parseInternalFileLinkUrl(url);
        expect(parsed).not.toBeNull();
        expect(parsed!.line).toBe('');
        expect(parsed!.column).toBe('');
    });

    it('round-trips a path containing special characters', () => {
        const path = '/session root/path with spaces/file.ts';
        const url = buildInternalFileLinkUrl(path, 1, 1);
        expect(url.startsWith(INTERNAL_FILE_SCHEME)).toBe(true);
        const parsed = parseInternalFileLinkUrl(url);
        expect(parsed).not.toBeNull();
    });
});

describe('parseInternalFileLinkUrl malformed input', () => {
    it('returns null for a URL with wrong scheme', () => {
        expect(parseInternalFileLinkUrl('file:abc123?line=1&column=2')).toBeNull();
        expect(parseInternalFileLinkUrl('https://example.com/file')).toBeNull();
    });

    it('returns null when the path segment is empty', () => {
        expect(parseInternalFileLinkUrl('happy-file:?line=1&column=2')).toBeNull();
        expect(parseInternalFileLinkUrl('happy-file:')).toBeNull();
    });

    it('returns empty string for missing query params', () => {
        const result = parseInternalFileLinkUrl('happy-file:abc123');
        expect(result).not.toBeNull();
        expect(result!.line).toBe('');
        expect(result!.column).toBe('');
    });
});

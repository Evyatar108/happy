import { encodeBase64Url } from '@/utils/base64url';

const HTTP_URL_PATTERN = /^https?:\/\//i;
const FILE_URL_PATTERN = /^file:/i;

export const INTERNAL_FILE_SCHEME = 'happy-file:';

export function isHttpMarkdownLink(url: string): boolean {
    return HTTP_URL_PATTERN.test(url.trim());
}

export function isFileMarkdownLink(url: string): boolean {
    return FILE_URL_PATTERN.test(url.trim());
}

export function isInternalFileLinkUrl(url: string): boolean {
    return url.trim().startsWith(INTERNAL_FILE_SCHEME);
}

export function buildInternalFileLinkUrl(path: string, line: number | null, column: number | null): string {
    return `${INTERNAL_FILE_SCHEME}${encodeBase64Url(path)}?line=${line ?? ''}&column=${column ?? ''}`;
}

export function parseInternalFileLinkUrl(url: string): { path: string; line: string; column: string } | null {
    if (!isInternalFileLinkUrl(url)) {
        return null;
    }

    const withoutScheme = url.trim().slice(INTERNAL_FILE_SCHEME.length);
    const queryStart = withoutScheme.indexOf('?');
    const path = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart);
    const params = new URLSearchParams(queryStart === -1 ? '' : withoutScheme.slice(queryStart + 1));

    if (!path) {
        return null;
    }

    return {
        path,
        line: params.get('line') ?? '',
        column: params.get('column') ?? '',
    };
}

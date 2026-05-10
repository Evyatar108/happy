const HTTP_URL_PATTERN = /^https?:\/\//i;
const FILE_URL_PATTERN = /^file:/i;

export function isHttpMarkdownLink(url: string): boolean {
    return HTTP_URL_PATTERN.test(url.trim());
}

export function isFileMarkdownLink(url: string): boolean {
    return FILE_URL_PATTERN.test(url.trim());
}

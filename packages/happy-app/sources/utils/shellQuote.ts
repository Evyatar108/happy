export function shellQuotePosix(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function shellQuoteWindows(value: string): string {
    if (/\r|\n/.test(value)) {
        throw new Error('Cannot shell-quote values containing newlines');
    }

    return `"${value
        .replace(/"/g, '""')
        .replace(/[&|<>^()%!]/g, '^$&')}"`;
}

export function shellQuoteForOs(value: string, os?: string | null): string {
    return os === 'win32' || os === 'windows'
        ? shellQuoteWindows(value)
        : shellQuotePosix(value);
}

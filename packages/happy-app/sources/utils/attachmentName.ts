const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function decodeFilename(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function splitName(name: string): { stem: string; extension: string } {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === name.length - 1) {
        return { stem: name, extension: '' };
    }

    return {
        stem: name.slice(0, dotIndex),
        extension: name.slice(dotIndex),
    };
}

export function sanitizeAttachmentName(input: string): string {
    const decoded = decodeFilename(input)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\\/g, '/')
        .trim();
    const leaf = decoded.split('/').filter(Boolean).pop() ?? '';
    let sanitized = leaf
        .replace(/[<>:"|?*]/g, '')
        .replace(/[. ]+$/g, '')
        .trim();

    if (sanitized === '' || sanitized === '.' || sanitized === '..') {
        sanitized = 'attachment';
    }

    const { stem, extension } = splitName(sanitized);
    if (WINDOWS_RESERVED_NAMES.test(stem)) {
        return `${stem}_${extension}`;
    }

    return sanitized;
}

export function dedupeAttachmentNames(names: readonly string[]): string[] {
    const used = new Set<string>();

    return names.map((name) => {
        const sanitized = sanitizeAttachmentName(name);
        let candidate = sanitized;
        let suffix = 2;

        while (used.has(candidate.toLocaleLowerCase())) {
            const { stem, extension } = splitName(sanitized);
            candidate = `${stem} (${suffix})${extension}`;
            suffix += 1;
        }

        used.add(candidate.toLocaleLowerCase());
        return candidate;
    });
}

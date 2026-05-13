import type { Session } from '@/sync/storageTypes';

function formatPathRelativeToHome(path: string, homeDir?: string): string {
    if (!homeDir) return path;

    const normalizedHome = homeDir.endsWith('/') ? homeDir.slice(0, -1) : homeDir;
    if (!path.startsWith(normalizedHome)) return path;

    const relativePath = path.slice(normalizedHome.length);
    if (relativePath.startsWith('/')) return `~${relativePath}`;
    if (relativePath === '') return '~';
    return `~/${relativePath}`;
}

export function truncatePathFromStart(path: string, maxChars: number): string {
    if (path.length <= maxChars) return path;
    if (maxChars <= 1) return '…';

    const normalizedPath = path.replace(/\\/g, '/');
    const tailBudget = Math.max(1, maxChars - 2);
    const segments = normalizedPath.split('/').filter(Boolean);
    const tailSegments: string[] = [];

    for (let i = segments.length - 1; i >= 0; i--) {
        const candidateSegments = [segments[i], ...tailSegments];
        const candidate = `…/${candidateSegments.join('/')}`;
        if (candidate.length > maxChars) break;
        tailSegments.unshift(segments[i]);
    }

    if (tailSegments.length > 0) {
        return `…/${tailSegments.join('/')}`;
    }

    return `…${normalizedPath.slice(-tailBudget)}`;
}

export function getActiveSessionPathSurfaces(options: {
    session: Session | null | undefined;
    unifiedNewSessionComposer: boolean;
    projectPathHeaderMaxChars: number;
}): { chatHeaderSubtitle?: string; agentInputProjectPathHeader?: string } {
    const path = options.session?.metadata?.path;
    if (!path) {
        return {
            chatHeaderSubtitle: undefined,
            agentInputProjectPathHeader: undefined,
        };
    }

    const displayPath = formatPathRelativeToHome(path, options.session?.metadata?.homeDir);

    if (!options.unifiedNewSessionComposer) {
        return {
            chatHeaderSubtitle: displayPath,
            agentInputProjectPathHeader: undefined,
        };
    }

    return {
        chatHeaderSubtitle: undefined,
        agentInputProjectPathHeader: truncatePathFromStart(displayPath, options.projectPathHeaderMaxChars),
    };
}

import type { LatestBoundary } from '@/sync/reducer/reducer';

export function updateComposeStartAt(
    composeStartAt: number | null,
    previousText: string,
    nextText: string,
    now: number,
): number | null {
    if (previousText.length === 0 && nextText.length > 0) {
        return now;
    }
    if (previousText.length > 0 && nextText.length === 0) {
        return null;
    }
    return composeStartAt;
}

export function shouldShowBoundaryAdvisory(
    latestBoundary: LatestBoundary | null,
    composeStartAt: number | null,
): boolean {
    return composeStartAt !== null && latestBoundary !== null && latestBoundary.at > composeStartAt;
}

import { describe, expect, it } from 'vitest';
import {
    PREFETCH_TRIGGER_GAP_SEQS,
    RENDER_WINDOW_OVERSCAN_SEQS,
    computePrefetchOlderRange,
    computeRenderWindow,
    shouldPrefetchOlder,
} from './messageWindow';

describe('messageWindow', () => {
    describe('computeRenderWindow', () => {
        it('derives the render window from raw visible seqs plus JS-side overscan', () => {
            expect(computeRenderWindow({ visibleSeqs: [42, 40, 41] })).toEqual({
                firstSeq: 40 - RENDER_WINDOW_OVERSCAN_SEQS,
                lastSeq: 42 + RENDER_WINDOW_OVERSCAN_SEQS,
            });

            expect(computeRenderWindow({ visibleSeqs: [10] })).toEqual({
                firstSeq: 10 - RENDER_WINDOW_OVERSCAN_SEQS,
                lastSeq: 10 + RENDER_WINDOW_OVERSCAN_SEQS,
            });
        });

        it('filters pending messages before deriving min and max seqs', () => {
            expect(computeRenderWindow({ visibleSeqs: [39, Number.MAX_SAFE_INTEGER, 44] })).toEqual({
                firstSeq: 39 - RENDER_WINDOW_OVERSCAN_SEQS,
                lastSeq: 44 + RENDER_WINDOW_OVERSCAN_SEQS,
            });
        });

        it('returns null when the raw viewport contains only pending entries', () => {
            expect(computeRenderWindow({ visibleSeqs: [Number.MAX_SAFE_INTEGER] })).toBeNull();
        });

        it('has no overload accepting a pre-collapsed scalar pair', () => {
            if (false) {
                // @ts-expect-error computeRenderWindow accepts raw visibleSeqs only.
                computeRenderWindow({ minVisibleSeq: 1, maxVisibleSeq: 2 });
            }

            expect(computeRenderWindow({ visibleSeqs: [] })).toBeNull();
        });
    });

    describe('shouldPrefetchOlder', () => {
        it('returns true only when the older edge is close and no request is active', () => {
            expect(shouldPrefetchOlder({
                renderWindow: { firstSeq: 115, lastSeq: 160 },
                oldestLoadedSeq: 100,
                activePrefetch: undefined,
                hasOlder: true,
            })).toBe(true);
        });

        it('does not prefetch when there are no older messages', () => {
            expect(shouldPrefetchOlder({
                renderWindow: { firstSeq: 115, lastSeq: 160 },
                oldestLoadedSeq: 100,
                activePrefetch: undefined,
                hasOlder: false,
            })).toBe(false);
        });

        it('does not prefetch before the viewport is initialized', () => {
            expect(shouldPrefetchOlder({
                renderWindow: null,
                oldestLoadedSeq: 100,
                activePrefetch: undefined,
                hasOlder: true,
            })).toBe(false);
        });

        it('does not prefetch while another prefetch is active or the gap is too large', () => {
            expect(shouldPrefetchOlder({
                renderWindow: { firstSeq: 115, lastSeq: 160 },
                oldestLoadedSeq: 100,
                activePrefetch: { requestId: 'in-flight' },
                hasOlder: true,
            })).toBe(false);

            expect(shouldPrefetchOlder({
                renderWindow: { firstSeq: 100 + PREFETCH_TRIGGER_GAP_SEQS + 1, lastSeq: 180 },
                oldestLoadedSeq: 100,
                activePrefetch: undefined,
                hasOlder: true,
            })).toBe(false);
        });
    });

    describe('computePrefetchOlderRange', () => {
        it('computes the next older range without refetching the boundary message', () => {
            assertRange({ oldestLoadedSeq: 100, pageSize: 80 }, { fromSeq: 20, toSeq: 99, limit: 80 });
            assertRange({ oldestLoadedSeq: 50, pageSize: 80 }, { fromSeq: 0, toSeq: 49, limit: 80 });
        });

        it('returns null when there are no older seqs to fetch', () => {
            expect(computePrefetchOlderRange({ oldestLoadedSeq: 1, pageSize: 80 })).toBeNull();
            expect(computePrefetchOlderRange({ oldestLoadedSeq: 0, pageSize: 80 })).toBeNull();
        });
    });
});

function assertRange(
    input: { oldestLoadedSeq: number; pageSize: number },
    expected: { fromSeq: number; toSeq: number; limit: number },
) {
    const range = computePrefetchOlderRange(input);

    expect(range).toEqual(expected);
    expect(range).not.toBeNull();

    if (range) {
        expect(range.toSeq).toBe(input.oldestLoadedSeq - 1);
        expect(range.toSeq - range.fromSeq + 1).toBeLessThanOrEqual(input.pageSize);
    }
}

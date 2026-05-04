import { describe, expect, it } from 'vitest';
import { computeInitialAfterSeq, computeOlderPageAfterSeq } from './paginationMath';

describe('paginationMath', () => {
    describe('computeInitialAfterSeq', () => {
        it('bounds cold-start fetches when the session is longer than the initial window', () => {
            expect(computeInitialAfterSeq(500, 80)).toEqual({
                afterSeq: 420,
                hasOlder: true,
            });
        });

        it('falls back to the full history when the session is shorter than the window', () => {
            expect(computeInitialAfterSeq(50, 80)).toEqual({
                afterSeq: 0,
                hasOlder: false,
            });
        });

        it('treats the exact boundary as fully loaded history', () => {
            expect(computeInitialAfterSeq(80, 80)).toEqual({
                afterSeq: 0,
                hasOlder: false,
            });
        });
    });

    describe('computeOlderPageAfterSeq', () => {
        it('returns the older-page cursor with full page remaining', () => {
            expect(computeOlderPageAfterSeq(100, 80)).toEqual({
                afterSeq: 19,
                hasOlder: true,
                hasOlderAfterFetch: true,
            });
        });

        it('reports no older pages when the loaded window already reaches seq=1', () => {
            expect(computeOlderPageAfterSeq(1, 80)).toEqual({
                afterSeq: 0,
                hasOlder: false,
                hasOlderAfterFetch: false,
            });
        });

        it('still fetches a final partial page when oldestLoadedSeq > 1 but the remainder is smaller than pageSize', () => {
            // 4 older messages remain (seq=1..4); fetch them all in one go and mark exhausted post-fetch.
            expect(computeOlderPageAfterSeq(5, 80)).toEqual({
                afterSeq: 0,
                hasOlder: true,
                hasOlderAfterFetch: false,
            });
            // 1 older message remains (seq=1); fetch it.
            expect(computeOlderPageAfterSeq(2, 80)).toEqual({
                afterSeq: 0,
                hasOlder: true,
                hasOlderAfterFetch: false,
            });
            // exact boundary: 80 older messages remain (seq=1..80); fetch them all.
            expect(computeOlderPageAfterSeq(81, 80)).toEqual({
                afterSeq: 0,
                hasOlder: true,
                hasOlderAfterFetch: false,
            });
        });
    });
});

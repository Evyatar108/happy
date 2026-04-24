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
        it('returns the older-page cursor using the R4 off-by-one fix', () => {
            expect(computeOlderPageAfterSeq(100, 80)).toEqual({
                afterSeq: 19,
                hasOlder: true,
            });
        });

        it('reports no older pages when the loaded window already reaches the start', () => {
            expect(computeOlderPageAfterSeq(5, 80)).toEqual({
                afterSeq: 0,
                hasOlder: false,
            });
        });
    });
});

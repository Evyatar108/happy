/**
 * Unit tests for the page-turn lazy-load threshold in pageToOlderMessages.
 *
 * The trigger condition must match the plan spec:
 *   nextOffset >= maxOffset - viewportHeight * 0.1
 *
 * i.e. fire loadOlder only when the user is within 10% of a viewport from
 * the oldest-content end. This is stricter (fires later) than the previous
 * `nextOffset >= maxOffset * 0.9` formula when contentHeight >> viewportHeight.
 */
import { describe, it, expect } from 'vitest';

/**
 * Pure replica of the threshold guard from pageToOlderMessages.
 * Returns true when loadOlder should be triggered.
 */
function shouldLoadOlder(
    contentHeight: number,
    viewportHeight: number,
    nextOffset: number,
): boolean {
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    return maxOffset > 0 && nextOffset >= maxOffset - viewportHeight * 0.1;
}

describe('pageToOlderMessages lazy-load threshold', () => {
    // Scenario: contentHeight 10 000, viewportHeight 800
    //   maxOffset = 9 200
    //   trigger zone starts at: 9 200 - 80 = 9 120
    const contentHeight = 10_000;
    const viewportHeight = 800;
    const maxOffset = contentHeight - viewportHeight; // 9 200
    const triggerEdge = maxOffset - viewportHeight * 0.1; // 9 120

    it('does NOT fire when nextOffset is well below the trigger zone', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge - 1)).toBe(false);
    });

    it('fires exactly at the trigger edge (nextOffset === maxOffset - viewportHeight * 0.1)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge)).toBe(true);
    });

    it('fires when nextOffset is between trigger edge and maxOffset', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge + 40)).toBe(true);
    });

    it('fires at maxOffset (fully scrolled to oldest end)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, maxOffset)).toBe(true);
    });

    it('does NOT fire when content fits entirely in the viewport (maxOffset === 0)', () => {
        expect(shouldLoadOlder(viewportHeight, viewportHeight, 0)).toBe(false);
        expect(shouldLoadOlder(viewportHeight - 1, viewportHeight, 0)).toBe(false);
    });

    it('divergence from the old * 0.9 formula — the new formula fires later', () => {
        // With the OLD formula: nextOffset >= maxOffset * 0.9
        //   old trigger = 9 200 * 0.9 = 8 280
        // With the NEW formula: nextOffset >= maxOffset - viewportHeight * 0.1
        //   new trigger = 9 200 - 80 = 9 120
        //
        // A nextOffset of 8 300 would have fired under the old formula but
        // must NOT fire under the new formula.
        const oldFormulaWouldFire = 8_300;
        expect(oldFormulaWouldFire).toBeGreaterThanOrEqual(maxOffset * 0.9); // confirms old formula triggers
        expect(shouldLoadOlder(contentHeight, viewportHeight, oldFormulaWouldFire)).toBe(false); // new formula does NOT
    });
});

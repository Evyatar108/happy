import { describe, expect, it } from 'vitest';
import { createAnimatedTextSpikeStyleWorklet } from './animated-text-spike.shared';

describe('animated-text-spike worklet factory', () => {
    it('returns fontSize and lineHeight at multiplier 1.0', () => {
        const worklet = createAnimatedTextSpikeStyleWorklet(16, 24);

        expect(worklet(1.0)).toEqual({
            fontSize: 16,
            lineHeight: 24,
        });
    });

    it('returns fontSize and lineHeight at multiplier 1.5', () => {
        const worklet = createAnimatedTextSpikeStyleWorklet(16, 24);

        expect(worklet(1.5)).toEqual({
            fontSize: 24,
            lineHeight: 36,
        });
    });
});

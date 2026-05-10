import { describe, expect, it } from 'vitest';
import { cycleAvatarStyle, AVATAR_STYLE_OPTIONS } from './avatarStyleCycle';

describe('cycleAvatarStyle', () => {
    it('advances to the next style in order', () => {
        expect(cycleAvatarStyle('pixelated')).toBe('gradient');
        expect(cycleAvatarStyle('gradient')).toBe('brutalist');
        expect(cycleAvatarStyle('brutalist')).toBe('brutalist-topic');
        expect(cycleAvatarStyle('brutalist-topic')).toBe('pixelated');
    });

    it('wraps around after four taps back to the starting style', () => {
        for (const start of AVATAR_STYLE_OPTIONS) {
            let current = start;
            for (let tap = 0; tap < 4; tap++) {
                current = cycleAvatarStyle(current);
            }
            expect(current).toBe(start);
        }
    });

    it('covers all four styles exactly once in one full cycle', () => {
        const visited: string[] = [];
        let current = AVATAR_STYLE_OPTIONS[0];
        for (let i = 0; i < AVATAR_STYLE_OPTIONS.length; i++) {
            current = cycleAvatarStyle(current);
            visited.push(current);
        }
        expect(visited.sort()).toEqual([...AVATAR_STYLE_OPTIONS].sort());
    });
});

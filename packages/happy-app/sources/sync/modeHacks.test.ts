import { describe, expect, it } from 'vitest';
import { hackMode, hackModes } from './modeHacks';

describe('modeHacks', () => {
    it('leaves already-lowercase plan/build names untouched', () => {
        // Production only dedupes "build, build" / "plan/plan" labels. Plain
        // lowercase names pass through unchanged — capitalisation is a UI concern.
        expect(hackMode({ key: 'build', name: 'build', description: null }).name).toBe('build');
        expect(hackMode({ key: 'plan', name: 'plan', description: null }).name).toBe('plan');
    });

    it('normalizes build and plan duplicated labels', () => {
        expect(hackMode({ key: 'build', name: 'build, build', description: null }).name).toBe('build');
        expect(hackMode({ key: 'plan', name: 'plan/plan', description: null }).name).toBe('plan');
    });

    it('keeps unmodified modes unchanged', () => {
        const mode = { key: 'default', name: 'Default', description: 'Ask for permissions' };
        expect(hackMode(mode)).toEqual(mode);
    });

    it('applies hacks across mode arrays', () => {
        expect(hackModes([
            { key: 'build', name: 'build, build', description: null },
            { key: 'plan', name: 'plan/plan', description: null },
        ])).toEqual([
            { key: 'build', name: 'build', description: null },
            { key: 'plan', name: 'plan', description: null },
        ]);
    });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importActual) => {
    const actual = await importActual<typeof import('react')>();
    return {
        ...actual,
        useMemo: <T>(factory: () => T) => factory(),
    };
});

vi.mock('react-native', () => ({
    Platform: { OS: 'web' },
    useWindowDimensions: () => ({ width: 1024, height: 768 }),
}));

vi.mock('@/components/layout', () => ({
    layout: {
        maxWidth: 800,
        headerMaxWidth: Number.POSITIVE_INFINITY,
    },
}));

vi.mock('@/sync/storage', () => ({
    useLocalSetting: () => 'default',
}));

vi.mock('@/utils/responsive', () => ({
    useDeviceType: () => 'tablet',
}));

import { getChatBodyWidth, getChatHeaderWidth } from './useChatWidth';

const screenWidths = [390, 1024, 1920] as const;

describe('getChatBodyWidth', () => {
    it('returns layout.maxWidth in default mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth('default', screenWidth)).toBe(800);
        }
    });

    it('returns 95% of screen width in wide mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth('wide', screenWidth)).toBe(Math.floor(screenWidth * 0.95));
        }
    });

    it('returns undefined in full mode regardless of width', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth('full', screenWidth)).toBeUndefined();
        }
    });
});

describe('getChatHeaderWidth', () => {
    it('returns layout.headerMaxWidth in default mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth('default', screenWidth)).toBe(Number.POSITIVE_INFINITY);
        }
    });

    it('returns 95% of screen width in wide mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth('wide', screenWidth)).toBe(Math.floor(screenWidth * 0.95));
        }
    });

    it('returns undefined in full mode regardless of width', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth('full', screenWidth)).toBeUndefined();
        }
    });
});

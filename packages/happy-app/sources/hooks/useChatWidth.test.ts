import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importActual) => {
    const actual = await importActual<typeof import('react')>();
    return {
        ...actual,
        useMemo: <T>(factory: () => T) => factory(),
    };
});

const rnMock = {
    width: 1024,
    height: 768,
};

vi.mock('react-native', () => ({
    useWindowDimensions: () => ({ width: rnMock.width, height: rnMock.height }),
}));

const storageMock = { chatWidthMode: 5 as number };
vi.mock('@/sync/storage', () => ({
    useLocalSetting: () => storageMock.chatWidthMode,
}));

import { CHAT_WIDTH_MARGIN_OPTIONS, getChatBodyWidth, getChatHeaderWidth, useChatWidth } from './useChatWidth';

const screenWidths = [390, 1024, 1920] as const;

describe('CHAT_WIDTH_MARGIN_OPTIONS', () => {
    it('exposes the picker values 0/3/5/10/15', () => {
        expect(CHAT_WIDTH_MARGIN_OPTIONS).toEqual([0, 3, 5, 10, 15]);
    });
});

describe('getChatBodyWidth', () => {
    it('returns undefined when margin is 0 (full width)', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth(0, screenWidth)).toBeUndefined();
        }
    });

    it('returns floor(screenWidth * (1 - margin/100)) for positive margins', () => {
        for (const screenWidth of screenWidths) {
            for (const margin of [3, 5, 10, 15]) {
                expect(getChatBodyWidth(margin, screenWidth)).toBe(
                    Math.floor(screenWidth * (1 - margin / 100)),
                );
            }
        }
    });
});

describe('getChatHeaderWidth', () => {
    it('returns undefined when margin is 0', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth(0, screenWidth)).toBeUndefined();
        }
    });

    it('matches body-width math for positive margins', () => {
        for (const screenWidth of screenWidths) {
            for (const margin of [3, 5, 10, 15]) {
                expect(getChatHeaderWidth(margin, screenWidth)).toBe(
                    Math.floor(screenWidth * (1 - margin / 100)),
                );
            }
        }
    });
});

describe('useChatWidth', () => {
    afterEach(() => {
        rnMock.width = 1024;
        rnMock.height = 768;
        storageMock.chatWidthMode = 5;
    });

    it('reads chatWidthMode and returns body+header for the active margin', () => {
        rnMock.width = 1322;
        storageMock.chatWidthMode = 10;

        const result = useChatWidth();
        expect(result.body).toBe(Math.floor(1322 * 0.9));
        expect(result.header).toBe(Math.floor(1322 * 0.9));
    });

    it('returns undefined body+header when margin is 0', () => {
        rnMock.width = 1322;
        storageMock.chatWidthMode = 0;

        const result = useChatWidth();
        expect(result.body).toBeUndefined();
        expect(result.header).toBeUndefined();
    });

    it('uses precomputedWidth when caller provides one (avoids second useWindowDimensions subscription)', () => {
        rnMock.width = 1024;
        storageMock.chatWidthMode = 15;

        const result = useChatWidth(1500);
        expect(result.body).toBe(Math.floor(1500 * 0.85));
        expect(result.header).toBe(Math.floor(1500 * 0.85));
    });
});

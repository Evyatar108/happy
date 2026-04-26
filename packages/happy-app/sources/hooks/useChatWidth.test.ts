import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importActual) => {
    const actual = await importActual<typeof import('react')>();
    return {
        ...actual,
        useMemo: <T>(factory: () => T) => factory(),
    };
});

const rnMock = {
    platformOS: 'web' as string,
    width: 1024,
    height: 768,
};

vi.mock('react-native', () => ({
    get Platform() { return { OS: rnMock.platformOS }; },
    useWindowDimensions: () => ({ width: rnMock.width, height: rnMock.height }),
}));

vi.mock('@/components/layout', () => ({
    layout: {
        maxWidth: 800,
        headerMaxWidth: 800,
    },
}));

const storageMock = { chatWidthMode: 'default' as string };
vi.mock('@/sync/storage', () => ({
    useLocalSetting: () => storageMock.chatWidthMode,
}));

const responsiveMock = { deviceType: 'tablet' as string };
vi.mock('@/utils/responsive', () => ({
    useDeviceType: () => responsiveMock.deviceType,
}));

import { getChatBodyWidth, getChatHeaderWidth, useChatWidth } from './useChatWidth';

const screenWidths = [390, 1024, 1920] as const;

describe('getChatBodyWidth', () => {
    it('returns layout.maxWidth in default mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth('default', screenWidth)).toBe(800);
        }
    });

    it('returns 85% of screen width in wide mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatBodyWidth('wide', screenWidth)).toBe(Math.floor(screenWidth * 0.85));
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
            expect(getChatHeaderWidth('default', screenWidth)).toBe(800);
        }
    });

    it('returns 85% of screen width in wide mode', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth('wide', screenWidth)).toBe(Math.floor(screenWidth * 0.85));
        }
    });

    it('returns undefined in full mode regardless of width', () => {
        for (const screenWidth of screenWidths) {
            expect(getChatHeaderWidth('full', screenWidth)).toBeUndefined();
        }
    });
});

describe('useChatWidth - native phone default branch', () => {
    afterEach(() => {
        rnMock.platformOS = 'web';
        rnMock.width = 1024;
        rnMock.height = 768;
        storageMock.chatWidthMode = 'default';
        responsiveMock.deviceType = 'tablet';
    });

    it('uses Math.max(width, height) for body and header on native phone in default mode (portrait 390x844)', () => {
        rnMock.platformOS = 'ios';
        rnMock.width = 390;
        rnMock.height = 844;
        responsiveMock.deviceType = 'phone';
        storageMock.chatWidthMode = 'default';

        const result = useChatWidth();
        expect(result.body).toBe(844);
        expect(result.header).toBe(844);
    });

    it('uses Math.max(width, height) for body and header on native phone in default mode (landscape 844x390)', () => {
        rnMock.platformOS = 'android';
        rnMock.width = 844;
        rnMock.height = 390;
        responsiveMock.deviceType = 'phone';
        storageMock.chatWidthMode = 'default';

        const result = useChatWidth();
        expect(result.body).toBe(844);
        expect(result.header).toBe(844);
    });

    it('uses Math.max(width, height) for body and header on native phone in default mode (1920x1080)', () => {
        rnMock.platformOS = 'ios';
        rnMock.width = 1920;
        rnMock.height = 1080;
        responsiveMock.deviceType = 'phone';
        storageMock.chatWidthMode = 'default';

        const result = useChatWidth();
        expect(result.body).toBe(1920);
        expect(result.header).toBe(1920);
    });

    it('does NOT apply phone override on web platform even if deviceType is phone', () => {
        rnMock.platformOS = 'web';
        rnMock.width = 390;
        rnMock.height = 844;
        responsiveMock.deviceType = 'phone';
        storageMock.chatWidthMode = 'default';

        const result = useChatWidth();
        expect(result.body).toBe(800);
        expect(result.header).toBe(800);
    });

    it('does NOT apply phone override on native tablet in default mode', () => {
        rnMock.platformOS = 'android';
        rnMock.width = 1024;
        rnMock.height = 768;
        responsiveMock.deviceType = 'tablet';
        storageMock.chatWidthMode = 'default';

        const result = useChatWidth();
        expect(result.body).toBe(800);
        expect(result.header).toBe(800);
    });

    it('does NOT apply phone override in wide mode on native phone', () => {
        rnMock.platformOS = 'ios';
        rnMock.width = 390;
        rnMock.height = 844;
        responsiveMock.deviceType = 'phone';
        storageMock.chatWidthMode = 'wide';

        const result = useChatWidth();
        expect(result.body).toBe(Math.floor(390 * 0.85));
        expect(result.header).toBe(Math.floor(390 * 0.85));
    });
});

import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useLocalSetting } from '@/sync/storage';

export const CHAT_WIDTH_MARGIN_OPTIONS = [0, 3, 5, 10, 15] as const;

export function getChatBodyWidth(marginPercent: number, screenWidth: number): number | undefined {
    if (marginPercent <= 0) {
        return undefined;
    }
    return Math.floor(screenWidth * (1 - marginPercent / 100));
}

export function getChatHeaderWidth(marginPercent: number, screenWidth: number): number | undefined {
    if (marginPercent <= 0) {
        return undefined;
    }
    return Math.floor(screenWidth * (1 - marginPercent / 100));
}

export function useChatWidth(precomputedWidth?: number): { body: number | undefined; header: number | undefined } {
    const marginPercent = useLocalSetting('chatWidthMode');
    const { width: dimensionsWidth } = useWindowDimensions();
    const width = precomputedWidth ?? dimensionsWidth;

    return React.useMemo(() => ({
        body: getChatBodyWidth(marginPercent, width),
        header: getChatHeaderWidth(marginPercent, width),
    }), [marginPercent, width]);
}

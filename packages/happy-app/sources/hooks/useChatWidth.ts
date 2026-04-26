import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { layout } from '@/components/layout';
import type { LocalSettings } from '@/sync/localSettings';
import { useLocalSetting } from '@/sync/storage';
import { useDeviceType } from '@/utils/responsive';

export type ChatWidthMode = LocalSettings['chatWidthMode'];

export function getChatBodyWidth(mode: ChatWidthMode, screenWidth: number): number | undefined {
    switch (mode) {
        case 'wide':
            return Math.floor(screenWidth * 0.95);
        case 'full':
            return undefined;
        default:
            return layout.maxWidth;
    }
}

export function getChatHeaderWidth(mode: ChatWidthMode, screenWidth: number): number | undefined {
    switch (mode) {
        case 'wide':
            return Math.floor(screenWidth * 0.95);
        case 'full':
            return undefined;
        default:
            return layout.headerMaxWidth;
    }
}

export function useChatWidth(precomputedWidth?: number): { body: number | undefined; header: number | undefined } {
    const mode = useLocalSetting('chatWidthMode');
    const { width: dimensionsWidth, height } = useWindowDimensions();
    const width = precomputedWidth ?? dimensionsWidth;
    const deviceType = useDeviceType();

    return React.useMemo(() => {
        // Keep native phones aligned with the existing layout helper, which caps to the larger window dimension.
        if (mode === 'default' && deviceType === 'phone' && Platform.OS !== 'web') {
            const screenWidth = Math.max(width, height);
            return {
                body: screenWidth,
                header: screenWidth,
            };
        }

        return {
            body: getChatBodyWidth(mode, width),
            header: getChatHeaderWidth(mode, width),
        };
    }, [deviceType, height, mode, width]);
}

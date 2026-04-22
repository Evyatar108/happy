import * as React from 'react';
import { useLocalSetting } from '@/sync/storage';

// Reads `LocalSettings.chatFontScale` (default 1.0, range 0.85–1.6) and returns
// the multiplier. Intended for use inside the chat screen only — body text,
// tool outputs, agent-event notices, the composer, etc. The setting is
// device-specific (LocalSettings, not Settings) and persists across reloads.
export function useChatFontScale(): number {
    const scale = useLocalSetting('chatFontScale');
    return scale ?? 1.0;
}

// Produces an inline style override for a specific text site given its base
// font size (and optional line height). Returns `null` when scale is exactly
// 1.0 so the array-spread pattern collapses to a no-op:
//
//     const scaled = useChatFontScaleOverride(16, 24);
//     <Text style={[styles.body, scaled]}>…</Text>
//
// When scale !== 1.0, the returned object wins over `styles.body.fontSize`
// because it's later in the style array.
export function useChatFontScaleOverride(
    baseFontSize: number,
    baseLineHeight?: number,
): { fontSize: number; lineHeight?: number } | null {
    const scale = useChatFontScale();
    return React.useMemo(() => {
        if (scale === 1.0) return null;
        return baseLineHeight !== undefined
            ? { fontSize: baseFontSize * scale, lineHeight: baseLineHeight * scale }
            : { fontSize: baseFontSize * scale };
    }, [scale, baseFontSize, baseLineHeight]);
}

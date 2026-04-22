import * as React from 'react';
import { TextStyle } from 'react-native';
import { useLocalSetting } from '@/sync/storage';

const MIN_CHAT_FONT_SCALE = 0.85;
const MAX_CHAT_FONT_SCALE = 1.6;
const ChatFontScaleContext = React.createContext<number | null>(null);

function clampChatFontScale(scale: number): number {
    return Math.max(MIN_CHAT_FONT_SCALE, Math.min(MAX_CHAT_FONT_SCALE, scale));
}

function scaleMonoFonts<T extends Record<string, TextStyle>>(styles: T, scale: number): T {
    return Object.fromEntries(
        Object.entries(styles).map(([key, style]) => [
            key,
            {
                ...style,
                ...(typeof style.fontSize === 'number' ? { fontSize: style.fontSize * scale } : {}),
                ...(typeof style.lineHeight === 'number' ? { lineHeight: style.lineHeight * scale } : {}),
            },
        ]),
    ) as T;
}

interface ChatFontScaleProviderProps {
    scale: number;
    children: React.ReactNode;
}

export function ChatFontScaleProvider({ scale, children }: ChatFontScaleProviderProps) {
    const value = React.useMemo(() => clampChatFontScale(scale), [scale]);
    return React.createElement(ChatFontScaleContext.Provider, { value }, children);
}

export function useChatFontScale(): number {
    const overrideScale = React.useContext(ChatFontScaleContext);
    const scale = useLocalSetting('chatFontScale');
    return React.useMemo(() => clampChatFontScale(overrideScale ?? scale ?? 1.0), [overrideScale, scale]);
}

export function useChatFontScaleOverride(baseFontSize: number, baseLineHeight?: number): Pick<TextStyle, 'fontSize' | 'lineHeight'> | null {
    const scale = useChatFontScale();

    return React.useMemo(() => {
        if (scale === 1) {
            return null;
        }

        return {
            fontSize: baseFontSize * scale,
            ...(typeof baseLineHeight === 'number' ? { lineHeight: baseLineHeight * scale } : {}),
        };
    }, [baseFontSize, baseLineHeight, scale]);
}

export function useChatScaledStyles<T extends Record<string, TextStyle>>(styles: T): T {
    const scale = useChatFontScale();
    return React.useMemo(() => scaleMonoFonts(styles, scale), [scale, styles]);
}

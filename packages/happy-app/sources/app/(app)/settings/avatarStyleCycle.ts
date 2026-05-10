export type KnownAvatarStyle = 'pixelated' | 'gradient' | 'brutalist' | 'brutalist-topic';

export const AVATAR_STYLE_OPTIONS: KnownAvatarStyle[] = ['pixelated', 'gradient', 'brutalist', 'brutalist-topic'];

export function isKnownAvatarStyle(style: string): style is KnownAvatarStyle {
    return AVATAR_STYLE_OPTIONS.includes(style as KnownAvatarStyle);
}

export function cycleAvatarStyle(current: KnownAvatarStyle): KnownAvatarStyle {
    const currentIndex = AVATAR_STYLE_OPTIONS.indexOf(current);
    const nextIndex = (currentIndex + 1) % AVATAR_STYLE_OPTIONS.length;
    return AVATAR_STYLE_OPTIONS[nextIndex];
}

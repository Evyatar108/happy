import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Appearance screen avatar style cycle', () => {
    const appearancePath = path.resolve(__dirname, 'appearance.tsx');
    const source = fs.readFileSync(appearancePath, 'utf8');

    it('keeps brutalist-topic in the known style guard and detail label', () => {
        expect(source).toMatch(/type KnownAvatarStyle = 'pixelated' \| 'gradient' \| 'brutalist' \| 'brutalist-topic'/);
        expect(source).toMatch(/AVATAR_STYLE_OPTIONS[\s\S]*'pixelated'[\s\S]*'gradient'[\s\S]*'brutalist'[\s\S]*'brutalist-topic'/);
        expect(source).toMatch(/t\(\s*['"]settingsAppearance\.avatarOptions\.brutalistTopic['"]\s*\)/);
    });

    it('cycles four taps back to the starting avatar style in the persisted order', () => {
        const styles = ['pixelated', 'gradient', 'brutalist', 'brutalist-topic'] as const;

        expect(source).toContain('const nextIndex = (currentIndex + 1) % 4;');
        expect(source).toContain('setAvatarStyle(nextStyle);');

        for (const start of styles) {
            let current = start;
            for (let tap = 0; tap < 4; tap++) {
                const currentIndex = styles.indexOf(current);
                current = styles[(currentIndex + 1) % 4];
            }

            expect(current).toBe(start);
        }
    });
});

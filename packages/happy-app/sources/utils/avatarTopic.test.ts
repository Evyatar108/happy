import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { allImages, colorPairs, hashCode } from '@/components/avatarBrutalistAssets';
import { buildTopicAvatarKey, resolveLegacyBrutalistAvatar, resolveTopicBrutalistAvatar } from './avatarTopic';

vi.mock('@/components/avatarBrutalistAssets', () => {
    function hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    return {
        allImages: Array.from({ length: 420 }, (_, index) => index),
        colorPairs: Array.from({ length: 6 }, (_, index) => ({ tint: `${index}`, background: `${index}` })),
        hashCode,
    };
});

const topicFixtures = [
    { summaryText: 'Debug Expo Metro reload on BOOX tablet', name: 'Tablet reload', flavor: 'codex' },
    { summaryText: 'Review encrypted sync session metadata storage', name: 'Storage review', flavor: 'claude' },
    { summaryText: 'Draft release notes for Android distribution', name: 'Release copy', flavor: 'gemini' },
    { summaryText: 'Trace markdown rendering for tool diff previews', name: 'Markdown diff', flavor: 'openclaw' },
    { summaryText: 'Investigate voice session reconnect state', name: 'Voice reconnect', flavor: 'claude' },
];

const legacyExpectations = [
    { id: 'session-alpha', imageIndex: 269, colorIndex: 4 },
    { id: 'session-beta', imageIndex: 365, colorIndex: 2 },
    { id: 'machine-a:session-1', imageIndex: 143, colorIndex: 4 },
    { id: 'codex-thread-42', imageIndex: 223, colorIndex: 0 },
    { id: 'emoji-🚀-session', imageIndex: 161, colorIndex: 2 },
];

const histogramFixtures = Array.from({ length: 50 }, (_, index) => ({
    summaryText: `Project ${index} topic ${['sync', 'render', 'storage', 'security', 'release', 'tablet', 'voice', 'search', 'diff', 'agent'][index % 10]} ${['alpha', 'beta', 'gamma', 'delta', 'epsilon'][Math.floor(index / 10)]}`,
    name: `Session ${index}`,
    flavor: ['claude', 'codex', 'gemini', 'openclaw', 'local'][index % 5],
}));

describe('avatarTopic', () => {
    it('exports the shared brutalist asset table and legacy hash primitives', () => {
        expect(allImages).toHaveLength(420);
        expect(colorPairs).toHaveLength(6);
        expect(hashCode('session-alpha')).toBe(1247707289);

        const source = readFileSync(resolve(__dirname, '../components/avatarBrutalistAssets.ts'), 'utf8');
        expect(source.match(/require\('@\/assets\/images\/brutalist\//g)).toHaveLength(420);
        expect(source).toContain('export const allImages');
        expect(source).toContain('export const colorPairs');
        expect(source).toContain('export function hashCode');
    });

    it('resolves topic avatars deterministically for fixture tuples', () => {
        const firstPass = topicFixtures.map(input => resolveTopicBrutalistAvatar({ id: 'fallback-id', ...input }));
        const secondPass = topicFixtures.map(input => resolveTopicBrutalistAvatar({ id: 'fallback-id', ...input }));

        expect(secondPass).toEqual(firstPass);
        expect(firstPass).toMatchInlineSnapshot(`
          [
            {
              "colorIndex": 4,
              "imageIndex": 312,
            },
            {
              "colorIndex": 3,
              "imageIndex": 97,
            },
            {
              "colorIndex": 5,
              "imageIndex": 326,
            },
            {
              "colorIndex": 5,
              "imageIndex": 122,
            },
            {
              "colorIndex": 2,
              "imageIndex": 245,
            },
          ]
        `);
    });

    it('preserves legacy brutalist id hashing bit-for-bit', () => {
        for (const expected of legacyExpectations) {
            expect(resolveLegacyBrutalistAvatar(expected.id)).toEqual({
                imageIndex: expected.imageIndex,
                colorIndex: expected.colorIndex,
            });
        }
    });

    it('falls back to the legacy id hash when no topic key can be built', () => {
        expect(buildTopicAvatarKey({ summaryText: '   ', name: '', flavor: null })).toBeNull();
        expect(resolveTopicBrutalistAvatar({ id: 'empty-topic', summaryText: '   ' })).toEqual(
            resolveLegacyBrutalistAvatar('empty-topic')
        );
    });

    it('handles Cyrillic and emoji topic inputs', () => {
        expect(buildTopicAvatarKey({ summaryText: 'Привет мир 🚀', name: 'Сессия', flavor: 'codex' })).toBe('codex|мир|привет|сессия|🚀');
        expect(resolveTopicBrutalistAvatar({ id: 'unicode', summaryText: 'Привет мир 🚀', name: 'Сессия', flavor: 'codex' })).toEqual({
            imageIndex: 60,
            colorIndex: 1,
        });
    });

    it('short-circuits to a pinned tuple when present', () => {
        expect(resolveTopicBrutalistAvatar({
            id: 'pin-source',
            summaryText: 'This topic would otherwise hash differently',
            pinned: { imageIndex: 17, colorIndex: 3 },
        })).toEqual({ imageIndex: 17, colorIndex: 3 });
    });

    it('keeps the committed 50-tuple fixture set below collision ceilings', () => {
        const pairs = new Map<string, number>();
        const images = new Map<number, number>();

        for (const fixture of histogramFixtures) {
            const avatar = resolveTopicBrutalistAvatar({ id: 'histogram-fallback', ...fixture });
            const pairKey = `${avatar.imageIndex}:${avatar.colorIndex}`;
            pairs.set(pairKey, (pairs.get(pairKey) ?? 0) + 1);
            images.set(avatar.imageIndex, (images.get(avatar.imageIndex) ?? 0) + 1);
        }

        expect(Math.max(...pairs.values())).toBeLessThanOrEqual(5);
        expect(Math.max(...images.values())).toBeLessThanOrEqual(8);
    });

    it('does not import sync, socket, network, or HTTP client modules', () => {
        const modulePaths = [
            resolve(__dirname, 'avatarTopic.ts'),
            resolve(__dirname, '../components/avatarBrutalistAssets.ts'),
        ];
        const importPattern = /^\s*import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gm;
        const disallowedPattern = /(?:^|\/)sync\/(?:sync|socket[^/]*|network[^/]*)$|(?:^|\/)(?:axios|ky|got|node-fetch|undici)$/;

        for (const modulePath of modulePaths) {
            const source = readFileSync(modulePath, 'utf8');
            const imports = Array.from(source.matchAll(importPattern), match => match[1]);
            expect(imports.filter(specifier => disallowedPattern.test(specifier))).toEqual([]);
        }
    });
});

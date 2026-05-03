/**
 * US-006 AC #13: Appearance toggle for `enableSocketRangeFetch`.
 *
 * (a) toggle row is present and bound to useLocalSettingMutable('enableSocketRangeFetch').
 * (b) tapping the Switch flips the persisted local-settings value.
 * (c) toggle sits in the same ItemList group as pinchToZoomEnabled and
 *     chatPaginatedScroll (the same ItemGroup as the AC requires).
 *
 * The screen module pulls in react-native-unistyles, expo-localization,
 * Slider, and several other native-only modules that fail to load under
 * Vitest's node runner. Following the source-text-grep precedent already
 * used in the repo (e.g. ChatList component-import constraints), we assert
 * (a)/(c) by reading appearance.tsx as text and verify (b) by running a
 * targeted local-settings persistence test against the real
 * `applyLocalSettings` reducer + LocalSettingsSchema parser.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { applyLocalSettings, localSettingsDefaults, localSettingsParse, LocalSettingsSchema } from '../../../sync/localSettings';

describe('Appearance screen — enableSocketRangeFetch toggle (US-006 AC #13)', () => {
    const appearancePath = path.resolve(__dirname, 'appearance.tsx');
    const source = fs.readFileSync(appearancePath, 'utf8');

    it('(a) renders an Item bound to useLocalSettingMutable(\'enableSocketRangeFetch\') with the new t-keys', () => {
        // The hook is wired
        expect(source).toMatch(/useLocalSettingMutable\(\s*['"]enableSocketRangeFetch['"]\s*\)/);
        // Title and subtitle reference the new translation keys
        expect(source).toMatch(/t\(\s*['"]settingsAppearance\.socketRangeFetchTitle['"]\s*\)/);
        expect(source).toMatch(/t\(\s*['"]settingsAppearance\.socketRangeFetchDescription['"]\s*\)/);
        // The Item's rightElement is a <Switch> whose value is bound to the
        // local-setting state value. We grep the immediate vicinity of the
        // socketRangeFetchTitle key to confirm the binding is colocated with
        // the Switch.
        const titleIdx = source.indexOf('socketRangeFetchTitle');
        expect(titleIdx).toBeGreaterThan(-1);
        const window = source.slice(titleIdx, titleIdx + 600);
        expect(window).toMatch(/<Switch[^>]*value=\{enableSocketRangeFetch\}[\s\S]*?onValueChange=\{setEnableSocketRangeFetch\}/);
    });

    it('(b) tapping the Switch flips the persisted local-settings value via applyLocalSettings', () => {
        // Default (flipped to on by default 2026-04-29 after manual BOOX verification).
        const defaults = { ...localSettingsDefaults };
        expect(defaults.enableSocketRangeFetch).toBe(true);

        // Round-trip preserves the on default
        const flippedOn = applyLocalSettings(defaults, { enableSocketRangeFetch: true });
        expect(flippedOn.enableSocketRangeFetch).toBe(true);

        // Round-trip through localSettingsParse (the persistence boundary)
        const parsed = localSettingsParse(flippedOn);
        expect(parsed.enableSocketRangeFetch).toBe(true);

        // Flip back off
        const flippedOff = applyLocalSettings(flippedOn, { enableSocketRangeFetch: false });
        expect(flippedOff.enableSocketRangeFetch).toBe(false);
    });

    it('(c) the toggle row sits in the same ItemGroup as pinchToZoomEnabled and chatPaginatedScroll', () => {
        // All three rows must appear inside the same ItemGroup. We locate
        // the ItemGroup that contains pinchToZoomTitle and assert the other
        // two keys appear inside that same group block.
        const groupOpenRegex = /<ItemGroup[\s\S]*?<\/ItemGroup>/g;
        const matches = source.match(groupOpenRegex) ?? [];
        const groupContaining = matches.find(g => g.includes('pinchToZoomTitle'));
        expect(groupContaining, 'expected an ItemGroup containing pinchToZoomTitle').toBeDefined();
        expect(groupContaining!).toContain('paginatedScrollTitle');
        expect(groupContaining!).toContain('socketRangeFetchTitle');
    });

    it('(d) flag is local-only — appears in LocalSettingsSchema but NOT in SettingsSchema', async () => {
        // The local schema includes the new key
        const shape = LocalSettingsSchema.shape;
        expect(Object.prototype.hasOwnProperty.call(shape, 'enableSocketRangeFetch')).toBe(true);

        // The remote settings schema must NOT have it (local-only contract).
        const settingsModulePath = path.resolve(__dirname, '../../../sync/settings.ts');
        const settingsSource = fs.readFileSync(settingsModulePath, 'utf8');
        expect(settingsSource).not.toMatch(/enableSocketRangeFetch/);
    });
});

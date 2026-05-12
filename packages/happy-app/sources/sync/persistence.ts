import { MMKV } from 'react-native-mmkv';
import { Settings, settingsDefaults, settingsParse } from './settings';
import { LocalSettings, localSettingsDefaults, localSettingsParse } from './localSettings';
import { Purchases, purchasesDefaults, purchasesParse } from './purchases';
import { Profile, profileDefaults, profileParse } from './profile';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';
import { allImages, colorPairs } from '@/components/avatarBrutalistAssets';

const mmkv = new MMKV();
const NEW_SESSION_DRAFT_KEY = 'new-session-draft-v1';
const REGISTERED_PUSH_TOKEN_KEY = 'registered-push-token-v1';

export type NewSessionAgentType = 'claude' | 'codex' | 'gemini' | 'openclaw';
export type NewSessionSessionType = 'simple' | 'worktree';

export interface NewSessionDraft {
    input: string;
    selectedMachineId: string | null;
    selectedPath: string | null;
    agentType: NewSessionAgentType;
    permissionMode: PermissionModeKey;
    modelMode: string;
    sessionType: NewSessionSessionType;
    worktreeKey: string | null;
    updatedAt: number;
}

export function loadSettings(): Settings {
    const settings = mmkv.getString('settings');
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            return settingsParse(parsed.settings ?? parsed);
        } catch (e) {
            console.error('Failed to parse settings', e);
            return { ...settingsDefaults };
        }
    }
    return { ...settingsDefaults };
}

export function saveSettings(settings: Settings) {
    mmkv.set('settings', JSON.stringify(settings));
}

export function loadLocalSettings(): LocalSettings {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            return localSettingsParse(parsed);
        } catch (e) {
            console.error('Failed to parse local settings', e);
            return { ...localSettingsDefaults };
        }
    }
    return { ...localSettingsDefaults };
}

export function saveLocalSettings(settings: LocalSettings) {
    mmkv.set('local-settings', JSON.stringify(settings));
}

export function loadThemePreference(): 'light' | 'dark' | 'adaptive' {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            const settings = localSettingsParse(parsed);
            return settings.themePreference;
        } catch (e) {
            console.error('Failed to parse local settings for theme preference', e);
            return localSettingsDefaults.themePreference;
        }
    }
    return localSettingsDefaults.themePreference;
}

export function loadPurchases(): Purchases {
    const purchases = mmkv.getString('purchases');
    if (purchases) {
        try {
            const parsed = JSON.parse(purchases);
            return purchasesParse(parsed);
        } catch (e) {
            console.error('Failed to parse purchases', e);
            return { ...purchasesDefaults };
        }
    }
    return { ...purchasesDefaults };
}

export function savePurchases(purchases: Purchases) {
    mmkv.set('purchases', JSON.stringify(purchases));
}

export function loadSessionDrafts(): Record<string, string> {
    const drafts = mmkv.getString('session-drafts');
    if (drafts) {
        try {
            return JSON.parse(drafts);
        } catch (e) {
            console.error('Failed to parse session drafts', e);
            return {};
        }
    }
    return {};
}

export function saveSessionDrafts(drafts: Record<string, string>) {
    mmkv.set('session-drafts', JSON.stringify(drafts));
}

export function loadNewSessionDraft(): NewSessionDraft | null {
    const raw = mmkv.getString(NEW_SESSION_DRAFT_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const input = typeof parsed.input === 'string' ? parsed.input : '';
        const selectedMachineId = typeof parsed.selectedMachineId === 'string' ? parsed.selectedMachineId : null;
        const selectedPath = typeof parsed.selectedPath === 'string' ? parsed.selectedPath : null;
        const agentType: NewSessionAgentType = parsed.agentType === 'codex' || parsed.agentType === 'gemini' || parsed.agentType === 'openclaw'
            ? parsed.agentType
            : 'claude';
        const permissionMode: PermissionModeKey = typeof parsed.permissionMode === 'string'
            ? parsed.permissionMode
            : 'default';
        const modelMode: string = typeof parsed.modelMode === 'string' ? parsed.modelMode : 'default';
        const sessionType: NewSessionSessionType = parsed.sessionType === 'worktree' ? 'worktree' : 'simple';
        const worktreeKey = typeof parsed.worktreeKey === 'string' ? parsed.worktreeKey : null;
        const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now();

        return {
            input,
            selectedMachineId,
            selectedPath,
            agentType,
            permissionMode,
            modelMode,
            sessionType,
            worktreeKey,
            updatedAt,
        };
    } catch (e) {
        console.error('Failed to parse new session draft', e);
        return null;
    }
}

export function saveNewSessionDraft(draft: NewSessionDraft) {
    mmkv.set(NEW_SESSION_DRAFT_KEY, JSON.stringify(draft));
}

export function clearNewSessionDraft() {
    mmkv.delete(NEW_SESSION_DRAFT_KEY);
}

export function loadRegisteredPushToken(): string | null {
    return mmkv.getString(REGISTERED_PUSH_TOKEN_KEY) ?? null;
}

export function saveRegisteredPushToken(token: string) {
    mmkv.set(REGISTERED_PUSH_TOKEN_KEY, token);
}

export function clearRegisteredPushToken() {
    mmkv.delete(REGISTERED_PUSH_TOKEN_KEY);
}

export function loadSessionPermissionModes(): Record<string, string> {
    const modes = mmkv.getString('session-permission-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session permission modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionPermissionModes(modes: Record<string, string>) {
    mmkv.set('session-permission-modes', JSON.stringify(modes));
}

export function loadSessionPermissionModeUserChosen(): Record<string, boolean> {
    const flags = mmkv.getString('session-permission-mode-user-chosen');
    if (flags) {
        try {
            return JSON.parse(flags);
        } catch (e) {
            console.error('Failed to parse session permission mode user chosen flags', e);
            return {};
        }
    }
    return {};
}

export function saveSessionPermissionModeUserChosen(flags: Record<string, boolean>) {
    mmkv.set('session-permission-mode-user-chosen', JSON.stringify(flags));
}

export function loadSessionModelModes(): Record<string, string> {
    const modes = mmkv.getString('session-model-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session model modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionModelModes(modes: Record<string, string>) {
    mmkv.set('session-model-modes', JSON.stringify(modes));
}

export function loadSessionEffortLevels(): Record<string, string> {
    const levels = mmkv.getString('session-effort-levels');
    if (levels) {
        try {
            return JSON.parse(levels);
        } catch (e) {
            console.error('Failed to parse session effort levels', e);
            return {};
        }
    }
    return {};
}

export function saveSessionEffortLevels(levels: Record<string, string>) {
    mmkv.set('session-effort-levels', JSON.stringify(levels));
}

export interface PinnedAvatarTuple {
    imageIndex: number;
    colorIndex: number;
}

function isPinnedAvatarTuple(value: unknown): value is PinnedAvatarTuple {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const { imageIndex, colorIndex } = value as PinnedAvatarTuple;
    return Number.isInteger(imageIndex)
        && imageIndex >= 0
        && imageIndex < allImages.length
        && Number.isInteger(colorIndex)
        && colorIndex >= 0
        && colorIndex < colorPairs.length;
}

export function loadSessionPinnedAvatars(): Record<string, PinnedAvatarTuple> {
    const pins = mmkv.getString('session-pinned-avatars');
    if (pins) {
        try {
            const parsed = JSON.parse(pins);
            if (!parsed || typeof parsed !== 'object') {
                return {};
            }
            return Object.fromEntries(
                Object.entries(parsed).filter((entry): entry is [string, PinnedAvatarTuple] => isPinnedAvatarTuple(entry[1]))
            );
        } catch (e) {
            console.error('Failed to parse session pinned avatars', e);
            return {};
        }
    }
    return {};
}

export function saveSessionPinnedAvatars(pins: Record<string, PinnedAvatarTuple>) {
    mmkv.set('session-pinned-avatars', JSON.stringify(pins));
}

export function loadProfile(): Profile {
    const profile = mmkv.getString('profile');
    if (profile) {
        try {
            const parsed = JSON.parse(profile);
            return profileParse(parsed);
        } catch (e) {
            console.error('Failed to parse profile', e);
            return { ...profileDefaults };
        }
    }
    return { ...profileDefaults };
}

export function saveProfile(profile: Profile) {
    mmkv.set('profile', JSON.stringify(profile));
}

// Simple temporary text storage for passing large strings between screens
export function storeTempText(content: string): string {
    const id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    mmkv.set(`temp_text_${id}`, content);
    return id;
}

export function retrieveTempText(id: string): string | null {
    const content = mmkv.getString(`temp_text_${id}`);
    if (content) {
        // Auto-delete after retrieval
        mmkv.delete(`temp_text_${id}`);
        return content;
    }
    return null;
}

export function clearPersistence() {
    mmkv.clearAll();
}

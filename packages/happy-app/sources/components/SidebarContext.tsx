import * as React from 'react';
import { useLocalSetting, storage } from '@/sync/storage';
import { useIsTablet } from '@/utils/responsive';
import { LocalSettings } from '@/sync/localSettings';

// Three-state tablet sidebar:
//   expanded  — full session list (default)
//   collapsed — narrow 72px icon rail with session avatars (from upstream PR #316)
//   hidden    — completely off-screen; a floating menu button restores it
export type SidebarMode = LocalSettings['sidebarMode'];

interface SidebarContextValue {
    mode: SidebarMode;
    isExpanded: boolean;
    isCollapsed: boolean;
    isHidden: boolean;
    // Edge-chevron behaviour: expanded <-> collapsed.
    toggleCollapsed: () => void;
    // Header "hide" button: jump straight to hidden for max focus.
    hide: () => void;
    // Floating restore button: bring the sidebar back to expanded.
    showExpanded: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export const SidebarProvider = React.memo(({ children }: { children: React.ReactNode }) => {
    const isTablet = useIsTablet();
    const persistedMode = useLocalSetting('sidebarMode');
    // Mode only affects tablet layouts; on phone the sidebar is never rendered.
    const mode: SidebarMode = isTablet ? (persistedMode ?? 'expanded') : 'expanded';

    const toggleCollapsed = React.useCallback(() => {
        const current = storage.getState().localSettings.sidebarMode ?? 'expanded';
        storage.getState().applyLocalSettings({
            sidebarMode: current === 'expanded' ? 'collapsed' : 'expanded',
        });
    }, []);

    const hide = React.useCallback(() => {
        storage.getState().applyLocalSettings({ sidebarMode: 'hidden' });
    }, []);

    const showExpanded = React.useCallback(() => {
        storage.getState().applyLocalSettings({ sidebarMode: 'expanded' });
    }, []);

    const value = React.useMemo(() => ({
        mode,
        isExpanded: mode === 'expanded',
        isCollapsed: mode === 'collapsed',
        isHidden: mode === 'hidden',
        toggleCollapsed,
        hide,
        showExpanded,
    }), [mode, toggleCollapsed, hide, showExpanded]);

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
});

export function useSidebar(): SidebarContextValue {
    const ctx = React.useContext(SidebarContext);
    if (!ctx) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return ctx;
}

// Width constants (shared between navigator, sidebar view, and collapsed view).
export const SIDEBAR_WIDTH_COLLAPSED = 72;
export const SIDEBAR_WIDTH_MIN = 250;
export const SIDEBAR_WIDTH_MAX = 360;

import * as React from 'react';
import { Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar, SIDEBAR_EDGE_WIDTH } from './SidebarContext';
import { t } from '@/text';

// Thin clickable strip on the right edge of the sidebar that toggles between
// expanded and collapsed modes. Visible in both expanded and collapsed modes;
// hidden (alongside the whole sidebar) when mode === 'hidden'.
export const CollapsibleSidebarEdge = React.memo(() => {
    const { theme } = useUnistyles();
    const { isCollapsed, toggleCollapsed } = useSidebar();

    return (
        <Pressable
            onPress={toggleCollapsed}
            style={({ pressed }) => [styles.wrapper, pressed && styles.wrapperPressed]}
            accessibilityLabel={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
            <Ionicons
                name={isCollapsed ? 'chevron-forward' : 'chevron-back'}
                size={16}
                color={theme.colors.textSecondary}
            />
        </Pressable>
    );
});

const styles = StyleSheet.create((theme) => ({
    // SIDEBAR_EDGE_WIDTH (18-px) wrapper gives a real tap target (RN clips
    // `hitSlop` to parent bounds, so a 12-px wrapper with hitSlop was
    // effectively still 12-px wide — too small for e-ink users). The 16-px
    // chevron icon is centered so visible padding is 1-px each side.
    wrapper: {
        width: SIDEBAR_EDGE_WIDTH,
        backgroundColor: theme.colors.groupped.background,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.divider,
        alignItems: 'center',
        justifyContent: 'center',
    },
    wrapperPressed: {
        backgroundColor: theme.colors.divider,
    },
}));

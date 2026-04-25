import * as React from 'react';
import { View, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from './SidebarContext';
import { t } from '@/text';

// Thin clickable strip on the right edge of the sidebar that toggles between
// expanded and collapsed modes. Visible in both expanded and collapsed modes;
// hidden (alongside the whole sidebar) when mode === 'hidden'.
export const CollapsibleSidebarEdge = React.memo(() => {
    const { theme } = useUnistyles();
    const { isCollapsed, toggleCollapsed } = useSidebar();

    return (
        <View style={styles.wrapper}>
            <Pressable
                onPress={toggleCollapsed}
                style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
                accessibilityLabel={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
                // 12 px strip is well below the 44×44 / 48 dp touch target; asymmetric
                // hitSlop widens tap area outward without colliding with the sidebar's
                // own content on the left.
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 20 }}
            >
                <Ionicons
                    name={isCollapsed ? 'chevron-forward' : 'chevron-back'}
                    size={16}
                    color={theme.colors.textSecondary}
                />
            </Pressable>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    wrapper: {
        width: 12,
        backgroundColor: theme.colors.groupped.background,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.divider,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    containerPressed: {
        backgroundColor: theme.colors.divider,
    },
}));

import * as React from 'react';
import { View, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from './SidebarContext';

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
                accessibilityLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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

import { useAuth } from '@/auth/AuthContext';
import * as React from 'react';
import { Drawer } from 'expo-router/drawer';
import { useIsTablet } from '@/utils/responsive';
import { SidebarView } from './SidebarView';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { useSidebar, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_EDGE_WIDTH } from './SidebarContext';
import { t } from '@/text';

export const SidebarNavigator = React.memo(() => {
    const auth = useAuth();
    const isTablet = useIsTablet();
    const { mode, isHidden, showExpanded } = useSidebar();
    const showPermanentDrawer = auth.isAuthenticated && isTablet && !isHidden;

    // Floating restore button only shows on routes that render no native
    // React-Navigation header — anywhere with `headerShown: true`, the 36×36
    // handle at top-left would land on the back chevron and intercept the
    // back tap. The two no-header tablet destinations are `/` and `/inbox`.
    // On `/session/:id` ChatHeaderView embeds its own restore glyph; on every
    // other route the user navigates back to `/` or `/inbox` to restore.
    const pathname = usePathname();
    const isNoHeaderRoute = pathname === '/' || pathname === '/inbox';
    const showExpandHandle = auth.isAuthenticated && isTablet && isHidden && isNoHeaderRoute;

    const { width: windowWidth } = useWindowDimensions();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();

    // Drawer width = inner content width + chevron-strip width. Inner content
    // is 72px in 'collapsed' mode (icon rail) or clamp(windowWidth*0.3) in
    // 'expanded'. The chevron strip lives inside the drawer alongside the
    // inner content, so the drawer must be widened to keep the inner area
    // at its intended size.
    const drawerWidth = React.useMemo(() => {
        if (!showPermanentDrawer) return 280;
        const innerWidth = mode === 'collapsed'
            ? SIDEBAR_WIDTH_COLLAPSED
            : Math.min(Math.max(Math.floor(windowWidth * 0.3), SIDEBAR_WIDTH_MIN), SIDEBAR_WIDTH_MAX);
        return innerWidth + SIDEBAR_EDGE_WIDTH;
    }, [windowWidth, showPermanentDrawer, mode]);

    const drawerNavigationOptions = React.useMemo(() => {
        if (!showPermanentDrawer) {
            // Sidebar is hidden (mode === 'hidden' on tablet, or phone layout).
            return {
                lazy: false,
                headerShown: false,
                drawerType: 'front' as const,
                swipeEnabled: false,
                drawerStyle: {
                    width: 0,
                    display: 'none' as const,
                },
            };
        }
        return {
            lazy: false,
            headerShown: false,
            drawerType: 'permanent' as const,
            drawerStyle: {
                backgroundColor: 'white',
                borderRightWidth: 0,
                width: drawerWidth,
            },
            swipeEnabled: false,
            drawerActiveTintColor: 'transparent',
            drawerInactiveTintColor: 'transparent',
            drawerItemStyle: { display: 'none' as const },
            drawerLabelStyle: { display: 'none' as const },
        };
    }, [showPermanentDrawer, drawerWidth]);

    const drawerContent = React.useCallback(() => <SidebarView />, []);

    return (
        <View style={styles.wrapper}>
            <Drawer
                screenOptions={drawerNavigationOptions}
                drawerContent={showPermanentDrawer ? drawerContent : undefined}
            />
            {showExpandHandle && (
                <Pressable
                    onPress={showExpanded}
                    accessibilityLabel={t('sidebar.show')}
                    hitSlop={12}
                    style={[styles.restoreHandle, { top: safeArea.top + 8 }]}
                >
                    <Ionicons name="menu" size={20} color={theme.colors.text} />
                </Pressable>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    wrapper: {
        flex: 1,
    },
    // Floating affordance to bring back the sidebar from `hidden` mode on
    // any tablet route except `/session/:id` (which has its own restore in
    // ChatHeaderView). Sized for finger-tap, with a low-opacity shadow so
    // it stays visible on low-contrast (e-ink) displays.
    restoreHandle: {
        position: 'absolute',
        left: 8,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
    },
}));

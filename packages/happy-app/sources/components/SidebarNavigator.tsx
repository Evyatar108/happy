import { useAuth } from '@/auth/AuthContext';
import * as React from 'react';
import { Drawer } from 'expo-router/drawer';
import { useIsTablet } from '@/utils/responsive';
import { SidebarView } from './SidebarView';
import { Slot } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { useSidebar, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from './SidebarContext';

export const SidebarNavigator = React.memo(() => {
    const auth = useAuth();
    const isTablet = useIsTablet();
    const { mode, isHidden, showExpanded } = useSidebar();
    const showPermanentDrawer = auth.isAuthenticated && isTablet && !isHidden;

    // Floating restore button is only safe on routes that don't render a native
    // React-Navigation header of their own (that would double up the back chevron).
    const pathname = usePathname();
    const isHandleSafeRoute = pathname === '/' || /^\/session\/[^/]+\/?$/.test(pathname);
    const showExpandHandle = auth.isAuthenticated && isTablet && isHidden && isHandleSafeRoute;

    const { width: windowWidth } = useWindowDimensions();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();

    // Drawer width depends on mode: 72px icon-rail for 'collapsed', normal for 'expanded'.
    const drawerWidth = React.useMemo(() => {
        if (!showPermanentDrawer) return 280;
        if (mode === 'collapsed') return SIDEBAR_WIDTH_COLLAPSED;
        return Math.min(Math.max(Math.floor(windowWidth * 0.3), SIDEBAR_WIDTH_MIN), SIDEBAR_WIDTH_MAX);
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
        <View style={{ flex: 1 }}>
            <Drawer
                screenOptions={drawerNavigationOptions}
                drawerContent={showPermanentDrawer ? drawerContent : undefined}
            />
            {showExpandHandle && (
                <Pressable
                    onPress={showExpanded}
                    accessibilityLabel="Show sidebar"
                    hitSlop={12}
                    style={{
                        position: 'absolute',
                        left: 8,
                        top: safeArea.top + 8,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: theme.colors.surface,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Visibility on low-contrast (e-ink) displays.
                        elevation: 3,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 2,
                    }}
                >
                    <Ionicons name="menu" size={20} color={theme.colors.text} />
                </Pressable>
            )}
        </View>
    );
});

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
import { useLocalSetting, useLocalSettingMutable } from '@/sync/storage';

export const SidebarNavigator = React.memo(() => {
    const auth = useAuth();
    const isTablet = useIsTablet();
    const sidebarCollapsed = useLocalSetting('sidebarCollapsed');
    const showPermanentDrawer = auth.isAuthenticated && isTablet && !sidebarCollapsed;
    // Only show the floating expand handle on routes that don't render their own
    // native/React-Navigation header. On headered routes (settings, inbox, friends,
    // session/info, …) the button would sit on top of the native back chevron.
    // The safe routes are the index `/` and the bare session screen `/session/:id`.
    const pathname = usePathname();
    const isHandleSafeRoute = pathname === '/' || /^\/session\/[^/]+\/?$/.test(pathname);
    const showExpandHandle = auth.isAuthenticated && isTablet && sidebarCollapsed && isHandleSafeRoute;
    const { width: windowWidth } = useWindowDimensions();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const [, setSidebarCollapsed] = useLocalSettingMutable('sidebarCollapsed');

    // Calculate drawer width only when needed
    const drawerWidth = React.useMemo(() => {
        if (!showPermanentDrawer) return 280; // Default width for hidden drawer
        return Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);
    }, [windowWidth, showPermanentDrawer]);

    const drawerNavigationOptions = React.useMemo(() => {
        if (!showPermanentDrawer) {
            // When drawer is hidden, use minimal configuration
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
        
        // When drawer is permanent
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

    // Always render SidebarView but hide it when not needed
    const drawerContent = React.useCallback(
        () => <SidebarView />,
        []
    );

    return (
        <View style={{ flex: 1 }}>
            <Drawer
                screenOptions={drawerNavigationOptions}
                drawerContent={showPermanentDrawer ? drawerContent : undefined}
            />
            {showExpandHandle && (
                // Positioned in the top-left header zone so it does not intercept list scroll
                // gestures or iOS back-swipe from the left edge. Sits below the status bar and
                // roughly at the header's vertical center on most tablet configurations.
                <Pressable
                    onPress={() => setSidebarCollapsed(false)}
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
                        // Keep the handle visible on low-contrast (e-ink) displays.
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
    )
});
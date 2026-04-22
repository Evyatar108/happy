import * as React from 'react';
import { storage, useLocalSetting, useSession, useSessionMessages } from "@/sync/storage";
import { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureStateChangeEvent, GestureUpdateEvent, PinchGestureHandlerEventPayload, PinchGesture } from 'react-native-gesture-handler';
import { ChatScaleLiveContext } from './ChatScaleLiveContext';
import { CHAT_FONT_SCALE_MIN, CHAT_FONT_SCALE_MAX } from '@/hooks/useChatFontScale';

const SCROLL_THRESHOLD = 300;

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
        />
    )
});

const ListHeader = React.memo(() => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />;
});

const ListFooter = React.memo((props: { sessionId: string }) => {
    const session = useSession(props.sessionId)!;
    return (
        <ChatFooter controlledByUser={session.agentState?.controlledByUser || false} />
    )
});

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
}) => {
    const { theme } = useUnistyles();
    const flatListRef = React.useRef<FlatList>(null);
    const currentOffsetRef = React.useRef<number>(0);
    const contentHeightRef = React.useRef(0);
    const previousFirstMessageIdRef = React.useRef(props.messages[0]?.id);
    const liveMultiplier = useSharedValue(1.0);
    const isActive = useSharedValue(false);
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [viewportHeight, setViewportHeight] = React.useState<number>(0);
    const pinchToZoomEnabled = useLocalSetting('pinchToZoomEnabled');
    const chatPaginatedScroll = useLocalSetting('chatPaginatedScroll');
    const chatFontScale = useLocalSetting('chatFontScale');

    const keyExtractor = useCallback((item: any) => item.id, []);
    const renderItem = useCallback(({ item }: { item: any }) => (
        <MessageView message={item} metadata={props.metadata} sessionId={props.sessionId} />
    ), [props.metadata, props.sessionId]);

    // In inverted FlatList, offset 0 = latest messages (visual bottom).
    // Offset increases as user scrolls up to see older messages.
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        currentOffsetRef.current = offsetY;
        setShowScrollButton(offsetY > SCROLL_THRESHOLD);
    }, []);

    const scrollToBottom = useCallback(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
        setViewportHeight(event.nativeEvent.layout.height);
    }, []);

    const handleContentSizeChange = React.useCallback((_: number, height: number) => {
        contentHeightRef.current = height;
    }, []);

    const pageToOlderMessages = React.useCallback(() => {
        const maxOffset = Math.max(0, contentHeightRef.current - viewportHeight);
        const pageSize = viewportHeight;
        const nextOffset = Math.max(
            0,
            Math.min(maxOffset, currentOffsetRef.current + pageSize),
        );
        currentOffsetRef.current = nextOffset;
        setShowScrollButton(nextOffset > SCROLL_THRESHOLD);
        flatListRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    }, [viewportHeight]);

    const pageToNewerMessages = React.useCallback(() => {
        const maxOffset = Math.max(0, contentHeightRef.current - viewportHeight);
        const pageSize = viewportHeight;
        const nextOffset = Math.max(
            0,
            Math.min(maxOffset, currentOffsetRef.current - pageSize),
        );
        currentOffsetRef.current = nextOffset;
        setShowScrollButton(nextOffset > SCROLL_THRESHOLD);
        flatListRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    }, [viewportHeight]);

    const setChatFontScale = React.useCallback((nextScale: number) => {
        storage.getState().applyLocalSettings({ chatFontScale: nextScale });
    }, []);

    const pinchGesture = React.useMemo(() => {
        // The installed RNGH typings do not expose min/max pointer helpers on PinchGesture yet.
        const pinchBase = (Gesture.Pinch() as unknown as { minPointers(n: number): { maxPointers(n: number): PinchGesture } })
            .minPointers(2).maxPointers(2);
        return pinchBase
            .onBegin(() => {
                isActive.value = true;
            })
            .onUpdate((event: GestureUpdateEvent<PinchGestureHandlerEventPayload>) => {
                const nextScale = Math.max(CHAT_FONT_SCALE_MIN, Math.min(CHAT_FONT_SCALE_MAX, chatFontScale * event.scale));
                liveMultiplier.value = nextScale / chatFontScale;
            })
            .onEnd((event: GestureStateChangeEvent<PinchGestureHandlerEventPayload>) => {
                const nextScale = Math.max(CHAT_FONT_SCALE_MIN, Math.min(CHAT_FONT_SCALE_MAX, chatFontScale * event.scale));
                runOnJS(setChatFontScale)(nextScale);
            })
            .onFinalize(() => {
                liveMultiplier.value = 1;
                isActive.value = false;
            });
    }, [chatFontScale, isActive, liveMultiplier, setChatFontScale]);

    const olderMessagesTapGesture = React.useMemo(() => (
        Gesture.Tap().requireExternalGestureToFail(pinchGesture).onEnd((_, success) => {
            if (success) {
                runOnJS(pageToOlderMessages)();
            }
        })
    ), [pinchGesture, pageToOlderMessages]);

    const newerMessagesTapGesture = React.useMemo(() => (
        Gesture.Tap().requireExternalGestureToFail(pinchGesture).onEnd((_, success) => {
            if (success) {
                runOnJS(pageToNewerMessages)();
            }
        })
    ), [pinchGesture, pageToNewerMessages]);

    React.useEffect(() => {
        const currentFirstId = props.messages[0]?.id;
        const firstMessageChanged = currentFirstId !== previousFirstMessageIdRef.current;
        previousFirstMessageIdRef.current = currentFirstId;
        if (!chatPaginatedScroll || !firstMessageChanged) {
            return;
        }
        if (currentOffsetRef.current < SCROLL_THRESHOLD) {
            currentOffsetRef.current = 0;
            setShowScrollButton(false);
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
    }, [chatPaginatedScroll, props.messages[0]?.id]);

    const list = (
        <FlatList
            ref={flatListRef}
            data={props.messages}
            inverted={true}
            keyExtractor={keyExtractor}
            maintainVisibleContentPosition={{
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 10,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            renderItem={renderItem}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            scrollEventThrottle={16}
            scrollEnabled={!chatPaginatedScroll}
            ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
            ListFooterComponent={<ListHeader />}
        />
    );

    const inner = (
        <View style={{ flex: 1 }} onLayout={handleLayout}>
            {pinchToZoomEnabled ? (
                <GestureDetector gesture={pinchGesture}>
                    {list}
                </GestureDetector>
            ) : list}
            {chatPaginatedScroll && (
                <>
                    <GestureDetector gesture={olderMessagesTapGesture}>
                        <View
                            style={[
                                styles.pageTurnZone,
                                styles.pageTurnZoneTop,
                                { height: viewportHeight * 0.15 },
                            ]}
                        />
                    </GestureDetector>
                    <GestureDetector gesture={newerMessagesTapGesture}>
                        <View
                            style={[
                                styles.pageTurnZone,
                                styles.pageTurnZoneBottom,
                                { height: viewportHeight * 0.15 },
                            ]}
                        />
                    </GestureDetector>
                </>
            )}
            {showScrollButton && !chatPaginatedScroll && (
                <View style={styles.scrollButtonContainer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.scrollButton,
                            pressed ? styles.scrollButtonPressed : styles.scrollButtonDefault
                        ]}
                        onPress={scrollToBottom}
                    >
                        <Octicons name="arrow-down" size={14} color={theme.colors.text} />
                    </Pressable>
                </View>
            )}
        </View>
    );

    return pinchToZoomEnabled ? (
        <ChatScaleLiveContext.Provider value={{ liveMultiplier, isActive }}>
            {inner}
        </ChatScaleLiveContext.Provider>
    ) : inner;
});

const styles = StyleSheet.create((theme) => ({
    pageTurnZone: {
        position: 'absolute',
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
    },
    pageTurnZoneTop: {
        top: 0,
    },
    pageTurnZoneBottom: {
        bottom: 0,
    },
    scrollButtonContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'box-none',
    },
    scrollButton: {
        borderRadius: 16,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        shadowOpacity: theme.colors.shadow.opacity * 0.5,
        elevation: 2,
    },
    scrollButtonDefault: {
        backgroundColor: theme.colors.surface,
        opacity: 0.9,
    },
    scrollButtonPressed: {
        backgroundColor: theme.colors.surface,
        opacity: 0.7,
    },
}));

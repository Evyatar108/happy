import * as React from 'react';
import { storage, useLatestBoundary, useLocalSetting, useSession, useSessionMessages } from "@/sync/storage";
import { sync } from '@/sync/sync';
import { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import { useChatWidth } from '@/hooks/useChatWidth';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureStateChangeEvent, GestureUpdateEvent, PinchGestureHandlerEventPayload, PinchGesture } from 'react-native-gesture-handler';
import { ChatScaleLiveContext } from './ChatScaleLiveContext';
import { CHAT_FONT_SCALE_MIN, CHAT_FONT_SCALE_MAX } from '@/hooks/useChatFontScale';
import { BoundaryDivider } from './BoundaryDivider';
import { Text } from './StyledText';
import { t } from '@/text';
import { buildChatListBoundaryItems, getLatestBoundaryKey, type ChatListBoundaryItem } from './ChatList.boundaryItems';
import type { LatestBoundary } from '@/sync/reducer/reducer';

const SCROLL_THRESHOLD = 300;

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages } = useSessionMessages(props.session.id);
    const latestBoundary = useLatestBoundary(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
            latestBoundary={latestBoundary}
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
    latestBoundary: LatestBoundary | null,
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
    const { body: chatBodyWidth } = useChatWidth();
    const [preBoundaryExpanded, setPreBoundaryExpanded] = React.useState(false);
    const latestBoundaryKey = getLatestBoundaryKey(props.latestBoundary);

    React.useEffect(() => {
        setPreBoundaryExpanded(false);
    }, [latestBoundaryKey]);

    const boundaryItems = React.useMemo(() => buildChatListBoundaryItems(
        props.messages,
        props.latestBoundary,
        preBoundaryExpanded,
    ), [props.messages, props.latestBoundary, preBoundaryExpanded]);

    const handleShowPreBoundaryHistory = React.useCallback(async () => {
        if (boundaryItems.hasLoadedBoundary) {
            setPreBoundaryExpanded(true);
            return;
        }
        const latestBoundary = props.latestBoundary;
        if (!latestBoundary) {
            setPreBoundaryExpanded(true);
            return;
        }
        let prevOldestSeq: number | undefined;
        while (true) {
            const sessionMsgs = storage.getState().sessionMessages[props.sessionId];
            if (!sessionMsgs?.hasOlder || sessionMsgs.oldestLoadedSeq <= latestBoundary.seq) {
                break;
            }
            prevOldestSeq = sessionMsgs.oldestLoadedSeq;
            await sync.loadOlder(props.sessionId);
            const after = storage.getState().sessionMessages[props.sessionId];
            if (!after || after.oldestLoadedSeq === prevOldestSeq) {
                break;
            }
        }
        setPreBoundaryExpanded(true);
    }, [boundaryItems.hasLoadedBoundary, props.latestBoundary, props.sessionId]);

    const keyExtractor = useCallback((item: ChatListBoundaryItem) => item.id, []);
    const renderItem = useCallback(({ item }: { item: ChatListBoundaryItem }) => {
        if (item.kind === 'sticky-boundary') {
            return <BoundaryDivider kind={item.latestBoundary.kind} />;
        }
        if (item.kind === 'show-pre-boundary-history') {
            return (
                <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                        styles.showHistoryButton,
                        pressed ? styles.showHistoryButtonPressed : null,
                    ]}
                    onPress={() => { void handleShowPreBoundaryHistory(); }}
                >
                    <Octicons name="history" size={16} color={theme.colors.text} />
                    <Text style={styles.showHistoryText}>{t('chat.boundaryDivider.showPreClearHistory')}</Text>
                </Pressable>
            );
        }
        return <MessageView message={item.message} metadata={props.metadata} sessionId={props.sessionId} chatBodyWidth={chatBodyWidth} />;
    }, [props.metadata, props.sessionId, chatBodyWidth, theme.colors.text, handleShowPreBoundaryHistory]);

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

    const handleEndReached = React.useCallback(() => {
        const sessionMessages = storage.getState().sessionMessages[props.sessionId];
        if (!sessionMessages?.hasOlder || sessionMessages.loadingOlder) {
            return;
        }

        void sync.loadOlder(props.sessionId);
    }, [props.sessionId]);

    const pageToOlderMessages = React.useCallback(() => {
        const maxOffset = Math.max(0, contentHeightRef.current - viewportHeight);
        const pageSize = viewportHeight;
        const nextOffset = Math.max(
            0,
            Math.min(maxOffset, currentOffsetRef.current + pageSize),
        );
        if (maxOffset > 0 && nextOffset >= maxOffset - viewportHeight * 0.1) {
            const sessionMessages = storage.getState().sessionMessages[props.sessionId];
            if (sessionMessages?.hasOlder && !sessionMessages.loadingOlder) {
                void sync.loadOlder(props.sessionId);
            }
        }
        currentOffsetRef.current = nextOffset;
        setShowScrollButton(nextOffset > SCROLL_THRESHOLD);
        flatListRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    }, [props.sessionId, viewportHeight]);

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
        // Pinch gesture inherently requires 2 pointers in RNGH — the previous
        // `.minPointers(2).maxPointers(2)` cast-and-call pattern crashed at
        // runtime on RNGH 2.30.0 ("minPointers is not a function") because
        // those helpers do NOT exist on PinchGesture (they live on BaseGesture
        // for tap/longPress, not pinch). Default behavior is correct.
        return Gesture.Pinch()
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
            // This onFinalize reset IS the cancelled-pinch fallback (formerly tracked as `pendingScale` in plans). Do not remove without on-device re-verification on BOOX.
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
            data={boundaryItems.items}
            inverted={true}
            keyExtractor={keyExtractor}
            initialNumToRender={8}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews={true}
            maintainVisibleContentPosition={{
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 10,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            renderItem={renderItem}
            onScroll={handleScroll}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.1}
            onContentSizeChange={handleContentSizeChange}
            scrollEventThrottle={32}
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
    showHistoryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 8,
        marginHorizontal: 8,
        marginVertical: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        backgroundColor: theme.colors.surface,
    },
    showHistoryButtonPressed: {
        backgroundColor: theme.colors.surface,
        opacity: 0.7,
    },
    showHistoryText: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
}));

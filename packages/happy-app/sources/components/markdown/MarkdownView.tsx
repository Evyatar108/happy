import { MarkdownBlock, MarkdownSpan, parseMarkdown } from './parseMarkdown';
import * as React from 'react';
import { Image, Pressable, ScrollView, View, Platform, StyleSheet as RNStyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { HorizontalScrollView } from '../HorizontalScrollView';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';
import { AnimatedText, Text } from '../StyledText';
import { Typography } from '@/constants/Typography';
import { SimpleSyntaxHighlighter } from '../SimpleSyntaxHighlighter';
import { Modal } from '@/modal';
import { useLocalSetting } from '@/sync/storage';
import { storeTempText } from '@/sync/persistence';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { MermaidRenderer } from './MermaidRenderer';
import { TaskNotificationPill } from './TaskNotificationPill';
import { t } from '@/text';
import { isFileMarkdownLink, isHttpMarkdownLink } from './linkUtils';
import { useChatScaleAnimatedTextStyle, useChatScaledStyles } from '@/hooks/useChatFontScale';
import processClaudeMetaTags from './processClaudeMetaTags';
import { useSession } from '@/sync/storage';
import { splitSessionFileText } from '@/utils/sessionFileLinks';
import { encodeBase64Url } from '@/utils/base64url';

// Option type for callback
export type Option = {
    title: string;
};

function buildInternalFileLinkUrl(path: string, line: number | null, column: number | null): string {
    return `file:${encodeBase64Url(path)}?line=${line ?? ''}&column=${column ?? ''}`;
}

function parseInternalFileLinkUrl(url: string): { path: string; line: string; column: string } | null {
    if (!isFileMarkdownLink(url)) {
        return null;
    }

    const withoutScheme = url.trim().slice('file:'.length);
    const queryStart = withoutScheme.indexOf('?');
    const path = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart);
    const params = new URLSearchParams(queryStart === -1 ? '' : withoutScheme.slice(queryStart + 1));

    if (!path) {
        return null;
    }

    return {
        path,
        line: params.get('line') ?? '',
        column: params.get('column') ?? '',
    };
}

function addSessionFileLinksToSpans(spans: MarkdownSpan[], sessionRoot: string | null): MarkdownSpan[] {
    if (!sessionRoot) {
        return spans;
    }

    return spans.flatMap((span) => {
        if (span.url || span.styles.includes('code')) {
            return [span];
        }

        const segments = splitSessionFileText(span.text, sessionRoot);
        if (segments.length === 0) {
            return [span];
        }
        if (segments.length === 1 && !segments[0]?.link) {
            return [span];
        }

        return segments.map((segment) => {
            if (!segment.link?.withinSessionRoot) {
                return { ...span, text: segment.text, url: null };
            }
            return {
                ...span,
                text: segment.text,
                url: buildInternalFileLinkUrl(segment.link.absolutePath, segment.link.line, segment.link.column),
            };
        });
    });
}

function addSessionFileLinks(blocks: MarkdownBlock[], sessionRoot: string | null): MarkdownBlock[] {
    if (!sessionRoot) {
        return blocks;
    }

    return blocks.map((block) => {
        if (block.type === 'text' || block.type === 'header') {
            return { ...block, content: addSessionFileLinksToSpans(block.content, sessionRoot) };
        }
        if (block.type === 'list') {
            return { ...block, items: block.items.map((item) => addSessionFileLinksToSpans(item, sessionRoot)) };
        }
        if (block.type === 'numbered-list') {
            return {
                ...block,
                items: block.items.map((item) => ({
                    ...item,
                    spans: addSessionFileLinksToSpans(item.spans, sessionRoot),
                })),
            };
        }
        if (block.type === 'table') {
            return {
                ...block,
                headers: block.headers.map((header) => addSessionFileLinksToSpans(header, sessionRoot)),
                rows: block.rows.map((row) => row.map((cell) => addSessionFileLinksToSpans(cell, sessionRoot))),
            };
        }
        return block;
    });
}

export const MarkdownView = React.memo((props: { 
    markdown: string;
    onOptionPress?: (option: Option) => void;
    sessionId?: string;
}) => {
    const processed = React.useMemo(() => processClaudeMetaTags(props.markdown), [props.markdown]);
    const parsedBlocks = React.useMemo(
        () => parseMarkdown(processed.renderMarkdown, processed.taskNotifications),
        [processed.renderMarkdown, processed.taskNotifications]
    );
    const session = useSession(props.sessionId ?? '');
    const sessionRoot = session?.metadata?.path ?? null;
    const blocks = React.useMemo(
        () => addSessionFileLinks(parsedBlocks, sessionRoot),
        [parsedBlocks, sessionRoot]
    );
    
    // Backwards compatibility: The original version just returned the view, wrapping the list of blocks.
    // It made each of the individual text elements selectable. When we enable the markdownCopyV2 feature,
    // we disable the selectable property on individual text segments on mobile only. Instead, the long press
    // will be handled by a wrapper Pressable. If we don't disable the selectable property, then you will see
    // the native copy modal come up at the same time as the long press handler is fired.
    const markdownCopyV2 = useLocalSetting('markdownCopyV2');
    const selectable = Platform.OS === 'web' || !markdownCopyV2;
    const router = useRouter();

    const handleLinkPress = React.useCallback((url: string) => {
        if (isFileMarkdownLink(url)) {
            const fileLink = parseInternalFileLinkUrl(url);
            if (!fileLink || !props.sessionId) {
                return;
            }
            router.push(`/session/${props.sessionId}/file?path=${fileLink.path}&line=${fileLink.line}&column=${fileLink.column}&refresh=1&view=file`);
            return;
        }

        if (!isHttpMarkdownLink(url)) {
            return;
        }

        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        void WebBrowser.openBrowserAsync(url);
    }, [props.sessionId, router]);

    const handleLongPress = React.useCallback(() => {
        try {
            const textId = storeTempText(processed.copyMarkdown);
            router.push(`/text-selection?textId=${textId}`);
        } catch (error) {
            console.error('Error storing text for selection:', error);
            Modal.alert('Error', 'Failed to open text selection. Please try again.');
        }
    }, [processed.copyMarkdown, router]);
    const renderContent = () => {
        return (
            <View style={{ width: '100%' }}>
                {blocks.map((block, index) => {
                    if (block.type === 'text') {
                        return <RenderTextBlock spans={block.content} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} />;
                    } else if (block.type === 'header') {
                        return <RenderHeaderBlock level={block.level} spans={block.content} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} />;
                    } else if (block.type === 'horizontal-rule') {
                        return <View style={style.horizontalRule} key={index} />;
                    } else if (block.type === 'list') {
                        return <RenderListBlock items={block.items} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} />;
                    } else if (block.type === 'numbered-list') {
                        return <RenderNumberedListBlock items={block.items} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} />;
                    } else if (block.type === 'code-block') {
                        return <RenderCodeBlock content={block.content} language={block.language} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} />;
                    } else if (block.type === 'mermaid') {
                        return <MermaidRenderer content={block.content} key={index} />;
                    } else if (block.type === 'options') {
                        return <RenderOptionsBlock items={block.items} key={index} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onOptionPress={props.onOptionPress} />;
                    } else if (block.type === 'table') {
                        return <RenderTableBlock headers={block.headers} rows={block.rows} onLinkPress={handleLinkPress} selectable={selectable} key={index} first={index === 0} last={index === blocks.length - 1} />;
                    } else if (block.type === 'image') {
                        return <RenderImageBlock url={block.url} alt={block.alt} key={index} first={index === 0} last={index === blocks.length - 1} />;
                    } else if (block.type === 'task-notification') {
                        return <TaskNotificationPill data={block.data} key={index} />;
                    } else {
                        return null;
                    }
                })}
            </View>
        );
    }

    if (!markdownCopyV2) {
        return renderContent();
    }
    
    if (Platform.OS === 'web') {
        return renderContent();
    }
    
    // Use GestureDetector with LongPress gesture - it doesn't block pan gestures
    // so horizontal scrolling in code blocks and tables still works
    const longPressGesture = Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
            handleLongPress();
        })
        .runOnJS(true);

    return (
        <GestureDetector gesture={longPressGesture}>
            <View style={{ width: '100%' }}>
                {renderContent()}
            </View>
        </GestureDetector>
    );
});

type RenderSpanProps = {
    spans: MarkdownSpan[];
    baseStyle?: StyleProp<TextStyle>;
    selectable: boolean;
    onLinkPress: (url: string) => void;
};

function AnimatedMarkdownText(props: React.ComponentProps<typeof AnimatedText> & { baseStyle?: StyleProp<TextStyle> }) {
    const flattenedBaseStyle = RNStyleSheet.flatten(props.baseStyle) ?? {};
    const animatedTextStyle = useChatScaleAnimatedTextStyle(flattenedBaseStyle.fontSize ?? 0, flattenedBaseStyle.lineHeight);

    return <AnimatedText {...props} style={[props.baseStyle, props.style, animatedTextStyle]} />;
}

function RenderTextBlock(props: { spans: MarkdownSpan[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void }) {
    const textStyle = [style.text, props.first && style.first, props.last && style.last];
    return <AnimatedMarkdownText selectable={props.selectable} baseStyle={textStyle}><RenderSpans spans={props.spans} baseStyle={textStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></AnimatedMarkdownText>;
}

function RenderHeaderBlock(props: { level: 1 | 2 | 3 | 4 | 5 | 6, spans: MarkdownSpan[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void }) {
    const headerStyle = [style.header, (style as any)[`header${props.level}`], props.first && style.first, props.last && style.last];
    return <AnimatedMarkdownText selectable={props.selectable} baseStyle={headerStyle}><RenderSpans spans={props.spans} baseStyle={headerStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></AnimatedMarkdownText>;
}

function RenderListBlock(props: { items: MarkdownSpan[][], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void }) {
    const listStyle = [style.text, style.list];
    return (
        <View style={{ flexDirection: 'column', marginBottom: 8, gap: 1 }}>
            {props.items.map((item, index) => (
                <AnimatedMarkdownText selectable={props.selectable} baseStyle={listStyle} key={index}>- <RenderSpans spans={item} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></AnimatedMarkdownText>
            ))}
        </View>
    );
}

function RenderNumberedListBlock(props: { items: { number: number, spans: MarkdownSpan[] }[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void }) {
    const listStyle = [style.text, style.list];
    return (
        <View style={{ flexDirection: 'column', marginBottom: 8, gap: 1 }}>
            {props.items.map((item, index) => (
                <AnimatedMarkdownText selectable={props.selectable} baseStyle={listStyle} key={index}>{item.number.toString()}. <RenderSpans spans={item.spans} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></AnimatedMarkdownText>
            ))}
        </View>
    );
}

function RenderCodeBlock(props: { content: string, language: string | null, first: boolean, last: boolean, selectable: boolean }) {
    const [isHovered, setIsHovered] = React.useState(false);
    const scaledTextStyles = useChatScaledStyles({
        syntaxHighlighterText: {
            fontSize: 14,
            lineHeight: 20,
        },
    });

    const copyCode = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(props.content);
            Modal.alert(t('common.success'), t('markdown.codeCopied'), [{ text: t('common.ok'), style: 'cancel' }]);
        } catch (error) {
            console.error('Failed to copy code:', error);
            Modal.alert(t('common.error'), t('markdown.copyFailed'), [{ text: t('common.ok'), style: 'cancel' }]);
        }
    }, [props.content]);

    return (
        <View
            style={[style.codeBlock, props.first && style.first, props.last && style.last]}
            // @ts-ignore - Web only events
            onMouseEnter={() => setIsHovered(true)}
            // @ts-ignore - Web only events
            onMouseLeave={() => setIsHovered(false)}
        >
            {props.language && <AnimatedMarkdownText selectable={props.selectable} baseStyle={style.codeLanguage}>{props.language}</AnimatedMarkdownText>}
            <HorizontalScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            >
                <SimpleSyntaxHighlighter
                    code={props.content}
                    language={props.language}
                    selectable={props.selectable}
                    textStyle={scaledTextStyles.syntaxHighlighterText}
                />
            </HorizontalScrollView>
            <View
                style={[style.copyButtonWrapper, isHovered && style.copyButtonWrapperVisible]}
                {...(Platform.OS === 'web' ? ({ className: 'copy-button-wrapper' } as any) : {})}
            >
                <Pressable
                    style={style.copyButton}
                    onPress={copyCode}
                >
                    <Text style={style.copyButtonText}>{t('common.copy')}</Text>
                </Pressable>
            </View>
        </View>
    );
}

function RenderImageBlock(props: { url: string, alt: string, first: boolean, last: boolean }) {
    const accessibleLabel = props.alt || 'Markdown image';

    return (
        <View style={[style.imageBlock, props.first && style.first, props.last && style.last]}>
            <Image
                source={{ uri: props.url }}
                style={style.image}
                accessibilityLabel={accessibleLabel}
                resizeMode="contain"
            />
            {props.alt ? (
                <AnimatedMarkdownText baseStyle={style.imageCaption}>{props.alt}</AnimatedMarkdownText>
            ) : null}
        </View>
    );
}

function RenderOptionsBlock(props: { 
    items: string[], 
    first: boolean, 
    last: boolean, 
    selectable: boolean,
    onOptionPress?: (option: Option) => void 
}) {
    return (
        <View style={[style.optionsContainer, props.first && style.first, props.last && style.last]}>
            {props.items.map((item, index) => {
                if (props.onOptionPress) {
                    return (
                        <Pressable
                            key={index}
                            style={({ pressed }) => [
                                style.optionItem,
                                pressed && style.optionItemPressed
                            ]}
                            onPress={() => props.onOptionPress?.({ title: item })}
                        >
                            <View style={style.optionItemAccent} />
                            <AnimatedMarkdownText selectable={props.selectable} baseStyle={style.optionText}>{item}</AnimatedMarkdownText>
                        </Pressable>
                    );
                } else {
                    return (
                        <View key={index} style={style.optionItem}>
                            <View style={style.optionItemAccent} />
                            <AnimatedMarkdownText selectable={props.selectable} baseStyle={style.optionText}>{item}</AnimatedMarkdownText>
                        </View>
                    );
                }
            })}
        </View>
    );
}

function RenderSpans(props: RenderSpanProps) {
    const resolveSpanStyle = (spanStyle: MarkdownSpan['styles'][number]) => spanStyle === 'code'
        ? style.code
        : style[spanStyle];

    return (<>
        {props.spans.map((span, index) => {
            if (span.url) {
                const isExternalLink = isHttpMarkdownLink(span.url);
                const isInternalFileLink = isFileMarkdownLink(span.url);
                const isLink = isExternalLink || isInternalFileLink;
                return (
                    <AnimatedMarkdownText
                        key={index}
                        baseStyle={props.baseStyle}
                        selectable={props.selectable}
                        accessibilityRole={isLink ? 'link' : undefined}
                        style={[isLink && style.link, span.styles.map(resolveSpanStyle)]}
                        {...(isExternalLink && Platform.OS === 'web' ? { onClick: () => { if (typeof window !== 'undefined') window.open(span.url!, '_blank', 'noopener,noreferrer'); } } as any : {})}
                        {...(isInternalFileLink && Platform.OS === 'web' ? { onClick: () => props.onLinkPress(span.url!) } as any : {})}
                        onPress={isLink && Platform.OS !== 'web'
                            ? () => props.onLinkPress(span.url!)
                            : undefined}
                    >
                        {span.text}
                    </AnimatedMarkdownText>
                );
            } else {
                return <AnimatedMarkdownText key={index} baseStyle={props.baseStyle} selectable={props.selectable} style={span.styles.map(resolveSpanStyle)}>{span.text}</AnimatedMarkdownText>
            }
        })}
    </>)
}

// Plain-text length of a span array — used to estimate column widths.
function spansLength(spans: MarkdownSpan[]): number {
    let n = 0;
    for (const s of spans) n += s.text.length;
    return n;
}

const TABLE_MIN_COL_WIDTH = 80;
const TABLE_MAX_COL_WIDTH = 360;
const TABLE_CHAR_WIDTH = 8.5;  // approx px per char at 16px default font
const TABLE_CELL_H_PADDING = 24;

// Row-first layout with content-estimated column widths.
//
// - Each column's width is picked from the widest text in that column (header +
//   rows), clamped to [MIN, MAX]. This gives column-alignment across rows and
//   lets narrow columns (like "1, 2, 3") stay narrow.
// - Each row is a flex row — default `alignItems: 'stretch'` makes all cells in
//   a row match the tallest cell's height.
// - Wrapped in a horizontal ScrollView so wide tables still scroll instead of
//   being squashed unreadably.
function RenderTableBlock(props: {
    headers: MarkdownSpan[][],
    rows: MarkdownSpan[][][],
    onLinkPress: (url: string) => void,
    selectable: boolean,
    first: boolean,
    last: boolean
}) {
    const columnCount = props.headers.length;
    const rowCount = props.rows.length;
    const isLastCol = (colIndex: number) => colIndex === columnCount - 1;
    const isLastRow = (rowIndex: number) => rowIndex === rowCount - 1;

    const columnWidths = React.useMemo(() => {
        const widths = new Array(columnCount).fill(0);
        for (let c = 0; c < columnCount; c++) {
            widths[c] = Math.max(widths[c], spansLength(props.headers[c] ?? []));
        }
        for (const row of props.rows) {
            for (let c = 0; c < columnCount; c++) {
                widths[c] = Math.max(widths[c], spansLength(row[c] ?? []));
            }
        }
        return widths.map(len => Math.min(TABLE_MAX_COL_WIDTH, Math.max(TABLE_MIN_COL_WIDTH, len * TABLE_CHAR_WIDTH + TABLE_CELL_H_PADDING)));
    }, [props.headers, props.rows, columnCount]);

    return (
        <View style={[style.tableContainer, props.first && style.first, props.last && style.last]}>
            {/* flexGrow:0 stops iOS from stretching the horizontal ScrollView
                vertically to fill the parent — the cause of the table's frame
                extending down past the last row into empty space. */}
            <HorizontalScrollView style={{ flexGrow: 0 }}>
                <View>
                    {/* Header row */}
                    <View style={[style.tableRow, style.tableHeaderRow]}>
                        {props.headers.map((header, colIndex) => (
                            <View
                                key={`header-${colIndex}`}
                                style={[style.tableCell, style.tableHeaderCell, { width: columnWidths[colIndex] }, !isLastCol(colIndex) && style.tableCellBorderRight]}
                            >
                                <AnimatedMarkdownText baseStyle={style.tableHeaderText}>
                                    <RenderSpans spans={header} baseStyle={style.tableHeaderText} onLinkPress={props.onLinkPress} selectable={props.selectable} />
                                </AnimatedMarkdownText>
                            </View>
                        ))}
                    </View>
                    {/* Data rows */}
                    {props.rows.map((row, rowIndex) => (
                        <View
                            key={`row-${rowIndex}`}
                            style={[style.tableRow, !isLastRow(rowIndex) && style.tableRowBorderBottom]}
                        >
                            {props.headers.map((_, colIndex) => (
                                <View
                                    key={`cell-${rowIndex}-${colIndex}`}
                                    style={[style.tableCell, { width: columnWidths[colIndex] }, !isLastCol(colIndex) && style.tableCellBorderRight]}
                                >
                                    <AnimatedMarkdownText baseStyle={style.tableCellText}>
                                        <RenderSpans spans={row[colIndex] ?? []} baseStyle={style.tableCellText} onLinkPress={props.onLinkPress} selectable={props.selectable} />
                                    </AnimatedMarkdownText>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </HorizontalScrollView>
        </View>
    );
}


const style = StyleSheet.create((theme) => ({

    // Plain text

    text: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        marginTop: 8,
        marginBottom: 8,
        color: theme.colors.text,
        fontWeight: '400',
    },

    italic: {
        fontStyle: 'italic',
    },
    bold: {
        fontWeight: 'bold',
    },
    semibold: {
        fontWeight: '600',
    },
    code: {
        ...Typography.mono(),
        color: theme.colors.text,
    },
    link: {
        ...Typography.default(),
        color: theme.colors.text,
        fontWeight: '400',
        textDecorationLine: 'underline',
        cursor: 'pointer',
    },

    // Headers

    header: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    header1: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 36 to 24
        fontWeight: '900',
        marginTop: 16,
        marginBottom: 8
    },
    header2: {
        fontSize: 20,
        lineHeight: 24,  // Reduced from 36 to 32
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8
    },
    header3: {
        fontSize: 16,
        lineHeight: 28,  // Reduced from 32 to 28
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    header4: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '600',
        marginTop: 8,
        marginBottom: 8,
    },
    header5: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 28 to 24
        fontWeight: '600'
    },
    header6: {
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        fontWeight: '600'
    },

    //
    // List
    //

    list: {
        ...Typography.default(),
        color: theme.colors.text,
        marginTop: 0,
        marginBottom: 0,
    },

    //
    // Common
    //

    first: {
        // marginTop: 0
    },
    last: {
        // marginBottom: 0
    },

    //
    // Code Block
    //

    codeBlock: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        marginVertical: 8,
        position: 'relative',
        zIndex: 1,
        width: '100%',
    },
    copyButtonWrapper: {
        position: 'absolute',
        top: 8,
        right: 8,
        opacity: 0,
        zIndex: 10,
        elevation: 10,
        pointerEvents: 'none',
    },
    copyButtonWrapperVisible: {
        opacity: 1,
        pointerEvents: 'auto',
    },
    codeLanguage: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 8,
        paddingHorizontal: 16,
        marginBottom: 0,
    },
    horizontalRule: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginTop: 8,
        marginBottom: 8,
    },
    imageBlock: {
        width: '100%',
        maxWidth: 520,
        marginVertical: 8,
        alignSelf: 'flex-start',
        gap: 8,
    },
    image: {
        width: '100%',
        minHeight: 160,
        height: 240,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    imageCaption: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    copyButtonContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        elevation: 10,
        opacity: 1,
    },
    copyButtonContainerHidden: {
        opacity: 0,
    },
    copyButton: {
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        cursor: 'pointer',
    },
    copyButtonHidden: {
        display: 'none',
    },
    copyButtonCopied: {
        backgroundColor: theme.colors.success,
        borderColor: theme.colors.success,
        opacity: 1,
    },
    copyButtonText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 12,
        lineHeight: 16,
    },

    //
    // Options Block
    //

    optionsContainer: {
        flexDirection: 'column',
        gap: 8,
        marginVertical: 8,
    },
    optionItem: {
        // E-ink visibility: surfaceHighest (#f0f0f0) and divider (#eaeaea) both
        // quantize to pure white on color e-ink panels, making the options card
        // disappear into the page background. userMessageBackground (#d4d4d4)
        // is the proven-visible value documented in packages/happy-app/CLAUDE.md;
        // 2px textSecondary border survives quantization where 1px divider does not.
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.colors.userMessageBackground,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
    },
    optionItemAccent: {
        // Hard-edged left bar — strong "tap me" cue on e-ink, where shadow /
        // elevation / opacity-pressed states all fail to render.
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: theme.colors.text,
    },
    optionItemPressed: {
        opacity: 0.7,
        backgroundColor: theme.colors.surfaceHigh,
    },
    optionText: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },

    //
    // Table
    //

    tableContainer: {
        marginVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: '100%',
        alignSelf: 'flex-start',
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    tableRowBorderBottom: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    tableHeaderRow: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    tableCell: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'flex-start',
    },
    tableCellBorderRight: {
        borderRightWidth: 1,
        borderRightColor: theme.colors.divider,
    },
    tableHeaderCell: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    tableHeaderText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
    },
    tableCellText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
    },

    // Add global style for Web platform (Unistyles supports this via compiler plugin)
    ...(Platform.OS === 'web' ? {
        // Web-only CSS styles
        _____web_global_styles: {}
    } : {}),
}));

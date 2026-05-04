import React, { useMemo } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { calculateUnifiedDiff, DiffHunk, DiffToken } from '@/components/diff/calculateDiff';
import { AnimatedText } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';


interface DiffViewProps {
    oldText: string;
    newText: string;
    hunks?: DiffHunk[];
    contextLines?: number;
    maxVisibleLines?: number;
    showLineNumbers?: boolean;
    showPlusMinusSymbols?: boolean;
    showDiffStats?: boolean;
    oldTitle?: string;
    newTitle?: string;
    style?: ViewStyle;
    maxHeight?: number;
    wrapLines?: boolean;
    fontScaleX?: number;
}

const diffTextStyles = {
    hunkHeader: {
        ...Typography.mono(),
        fontSize: 12,
    },
    lineText: {
        ...Typography.mono(),
        fontSize: 13,
        lineHeight: 20,
    },
};

function AnimatedDiffText(props: React.ComponentProps<typeof AnimatedText> & { baseFontSize: number; baseLineHeight?: number }) {
    const { baseFontSize, baseLineHeight, style, ...rest } = props;
    const animatedTextStyle = useChatScaleAnimatedTextStyle(baseFontSize, baseLineHeight);

    return <AnimatedText {...rest} style={[style, animatedTextStyle]} />;
}

export const DiffView: React.FC<DiffViewProps> = ({
    oldText,
    newText,
    hunks: precomputedHunks,
    contextLines = 3,
    maxVisibleLines,
    showLineNumbers = true,
    showPlusMinusSymbols = true,
    wrapLines = false,
    style,
    fontScaleX = 1,
}) => {
    const { theme } = useUnistyles();
    const colors = theme.colors.diff;
    // Calculate diff with inline highlighting
    const { hunks } = useMemo(() => {
        if (precomputedHunks !== undefined) {
            return { hunks: precomputedHunks };
        }

        return calculateUnifiedDiff(oldText, newText, contextLines);
    }, [oldText, newText, precomputedHunks, contextLines]);

    const containerStyle: ViewStyle = {
        backgroundColor: theme.colors.surface,
        borderWidth: 0,
        flex: 1,
        ...style,
    };

    const formatLineContent = (content: string) => content.trimEnd();

    const renderLineContent = (content: string, baseColor: string, tokens?: DiffToken[]) => {
        const formatted = formatLineContent(content);

        if (tokens && tokens.length > 0) {
            let processedLeadingSpaces = false;

            return tokens.map((token, idx) => {
                if (!processedLeadingSpaces && token.value) {
                    const leadingMatch = token.value.match(/^( +)/);
                    if (leadingMatch) {
                        processedLeadingSpaces = true;
                        const leadingDots = '·'.repeat(leadingMatch[0].length);
                        const restOfToken = token.value.slice(leadingMatch[0].length);

                        if (token.added || token.removed) {
                            return (
                                <AnimatedDiffText key={idx} baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight}>
                                    <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: colors.leadingSpaceDot }}>{leadingDots}</AnimatedDiffText>
                                    <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{
                                        backgroundColor: token.added ? colors.inlineAddedBg : colors.inlineRemovedBg,
                                        color: token.added ? colors.inlineAddedText : colors.inlineRemovedText,
                                    }}>
                                        {restOfToken}
                                    </AnimatedDiffText>
                                </AnimatedDiffText>
                            );
                        }
                        return (
                            <AnimatedDiffText key={idx} baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight}>
                                <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: colors.leadingSpaceDot }}>{leadingDots}</AnimatedDiffText>
                                <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: baseColor }}>{restOfToken}</AnimatedDiffText>
                            </AnimatedDiffText>
                        );
                    }
                    processedLeadingSpaces = true;
                }

                if (token.added || token.removed) {
                    return (
                        <AnimatedDiffText
                            key={idx}
                            baseFontSize={diffTextStyles.lineText.fontSize}
                            baseLineHeight={diffTextStyles.lineText.lineHeight}
                            style={{
                                backgroundColor: token.added ? colors.inlineAddedBg : colors.inlineRemovedBg,
                                color: token.added ? colors.inlineAddedText : colors.inlineRemovedText,
                            }}
                        >
                            {token.value}
                        </AnimatedDiffText>
                    );
                }
                return <AnimatedDiffText key={idx} baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: baseColor }}>{token.value}</AnimatedDiffText>;
            });
        }

        const leadingSpaces = formatted.match(/^( +)/);
        const leadingDots = leadingSpaces ? '·'.repeat(leadingSpaces[0].length) : '';
        const mainContent = leadingSpaces ? formatted.slice(leadingSpaces[0].length) : formatted;

        return (
            <>
                {leadingDots && <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: colors.leadingSpaceDot }}>{leadingDots}</AnimatedDiffText>}
                <AnimatedDiffText baseFontSize={diffTextStyles.lineText.fontSize} baseLineHeight={diffTextStyles.lineText.lineHeight} style={{ color: baseColor }}>{mainContent}</AnimatedDiffText>
            </>
        );
    };

    const renderDiffContent = () => {
        const lines: React.ReactNode[] = [];
        let renderedLineCount = 0;

        hunks.forEach((hunk, hunkIndex) => {
            const remainingVisibleLines = maxVisibleLines === undefined
                ? hunk.lines.length
                : maxVisibleLines - renderedLineCount;

            if (remainingVisibleLines <= 0) {
                return;
            }

            // Add hunk header for non-first hunks
            if (hunkIndex > 0) {
                lines.push(
                    <AnimatedDiffText
                        key={`hunk-header-${hunkIndex}`}
                        baseFontSize={diffTextStyles.hunkHeader.fontSize}
                        numberOfLines={wrapLines ? undefined : 1}
                        style={{
                            ...diffTextStyles.hunkHeader,
                            color: colors.hunkHeaderText,
                            backgroundColor: colors.hunkHeaderBg,
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            transform: [{ scaleX: fontScaleX }],
                        }}
                    >
                        {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
                    </AnimatedDiffText>
                );
            }

            hunk.lines.forEach((line, lineIndex) => {
                if (maxVisibleLines !== undefined && renderedLineCount >= maxVisibleLines) {
                    return;
                }

                const isAdded = line.type === 'add';
                const isRemoved = line.type === 'remove';
                const textColor = isAdded ? colors.addedText : isRemoved ? colors.removedText : colors.contextText;
                const bgColor = isAdded ? colors.addedBg : isRemoved ? colors.removedBg : colors.contextBg;

                lines.push(
                    <AnimatedDiffText
                        key={`line-${hunkIndex}-${lineIndex}`}
                        baseFontSize={diffTextStyles.lineText.fontSize}
                        baseLineHeight={diffTextStyles.lineText.lineHeight}
                        numberOfLines={wrapLines ? undefined : 1}
                        style={{
                            ...diffTextStyles.lineText,
                            backgroundColor: bgColor,
                            transform: [{ scaleX: fontScaleX }],
                            paddingLeft: 8,
                            paddingRight: 8,
                        }}
                    >
                        {showLineNumbers && (
                            <Text style={{
                                color: colors.lineNumberText,
                                backgroundColor: colors.lineNumberBg,
                            }}>
                                {String(line.type === 'remove' ? line.oldLineNumber :
                                       line.type === 'add' ? line.newLineNumber :
                                       line.oldLineNumber).padStart(3, ' ')}
                            </Text>
                        )}
                        {showPlusMinusSymbols && (
                            <Text style={{ color: textColor }}>
                                {` ${isAdded ? '+' : isRemoved ? '-' : ' '} `}
                            </Text>
                        )}
                        {renderLineContent(line.content, textColor, line.tokens)}
                    </AnimatedDiffText>
                );
                renderedLineCount++;
            });
        });

        return lines;
    };

    return (
        <View style={[containerStyle, { overflow: 'hidden' }]}>
            {renderDiffContent()}
        </View>
    );
};

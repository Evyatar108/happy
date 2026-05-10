import * as React from "react";
import { View } from "react-native";
import { StyleSheet } from 'react-native-unistyles';
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { isSkillBodyMessage } from './markdown/skillBody';
import { AnimatedText } from './StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';
import { BoundaryDivider } from './BoundaryDivider';

const MAX_NESTED_CHILD_DEPTH = 3;

export const MessageView = React.memo((props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  chatBodyWidth: number | undefined;
  getMessageById?: (id: string) => Message | null;
}) => {
  const messageContentWidthStyle = React.useMemo(() => ({ maxWidth: props.chatBodyWidth }), [props.chatBodyWidth]);

  const content = (
    <View style={[styles.messageContent, messageContentWidthStyle]}>
      <RenderBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />
    </View>
  );

  // Whole-message scaling was rejected for this branch: later per-leaf animation must be the only live text scaling path.
  return (
    <View style={styles.messageContainer}>
      {content}
    </View>
  );
});

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  depth?: number;
}): React.ReactElement {
  const depth = props.depth ?? 0;

  if (depth > MAX_NESTED_CHILD_DEPTH) {
    return <NestedStepsSummary count={countNestedSteps([props.message])} />;
  }

  switch (props.message.kind) {
    case 'user-text':
      return <UserTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'agent-text':
      return <AgentTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
        depth={depth}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  const text = props.message.displayText || props.message.text;

  // Claude Code injects a verbatim copy of every loaded skill's SKILL.md after
  // the Skill tool_use/tool_result pair. Despite its `role:"user"` on the wire,
  // Happy's normalizer routes most variants through `AgentTextBlock`; this
  // user-text branch is kept as a defensive symmetric guard for any path that
  // surfaces the prefix here. See `isSkillBodyMessage` for the detection
  // contract and the same suppression in `AgentTextBlock`.
  if (isSkillBodyMessage(text)) {
    return null;
  }

  return (
    <View style={styles.userMessageContainer}>
      <View style={styles.userMessageBubble}>
        <MarkdownView markdown={text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
        {/* {__DEV__ && (
          <Text style={styles.debugText}>{JSON.stringify(props.message.meta)}</Text>
        )} */}
      </View>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title, { source: 'option' });
  }, [props.sessionId]);

  // Hide thinking messages
  if (props.message.isThinking) {
    return null;
  }

  // Claude Code injects the verbatim SKILL.md body after every Skill tool call.
  // Despite its `role:"user"` on the wire, Happy's normalizer routes it through
  // the agent-text path (typesRaw.ts), so we must suppress it here as well as
  // in `UserTextBlock`. See `isSkillBodyMessage` for the detection contract.
  if (isSkillBodyMessage(props.message.text)) {
    return null;
  }

  return (
    <View style={styles.agentMessageContainer}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <AgentEventText>{t('message.switchedToMode', { mode: props.event.mode })}</AgentEventText>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <AgentEventText>{props.event.message}</AgentEventText>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <AgentEventText>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </AgentEventText>
      </View>
    );
  }
  if (props.event.type === 'context-boundary') {
    return <BoundaryDivider kind={props.event.kind} />;
  }
  return (
    <View style={styles.agentEventContainer}>
      <AgentEventText>{t('message.unknownEvent')}</AgentEventText>
    </View>
  );
}

function AgentEventText(props: {
  children: React.ReactNode;
}) {
  const animatedTextStyle = useChatScaleAnimatedTextStyle(14);

  return <AnimatedText style={[styles.agentEventText, animatedTextStyle]}>{props.children}</AnimatedText>;
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
  depth: number;
}) {
  if (!props.message.tool) {
    return null;
  }

  const childDepth = props.depth + 1;
  const nestedStepCount = countNestedSteps(props.message.children);

  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
      {nestedStepCount > 0 && (
        <View style={styles.nestedChildren}>
          {childDepth > MAX_NESTED_CHILD_DEPTH ? (
            <NestedStepsSummary count={nestedStepCount} />
          ) : (
            props.message.children.map(child => (
              <RenderBlock
                key={child.id}
                message={child}
                metadata={props.metadata}
                sessionId={props.sessionId}
                getMessageById={props.getMessageById}
                depth={childDepth}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

function NestedStepsSummary(props: { count: number }) {
  const animatedTextStyle = useChatScaleAnimatedTextStyle(13);

  return (
    <View style={styles.nestedStepsSummary}>
      <AnimatedText style={[styles.nestedStepsText, animatedTextStyle]}>
        {t('tools.taskView.moreSteps', { count: props.count })}
      </AnimatedText>
    </View>
  );
}

function countNestedSteps(messages: Message[]): number {
  return messages.reduce((count, message) => {
    if (message.kind === 'tool-call') {
      return count + 1 + countNestedSteps(message.children);
    }

    return count;
  }, 0);
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  userMessageContainer: {
    flexDirection: 'column',
    backgroundColor: theme.colors.userMessageBackground,
    marginBottom: 12,
  },
  userMessageBubble: {
    paddingHorizontal: 16,
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  toolContainer: {
    marginHorizontal: 8,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  nestedChildren: {
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.textSecondary,
    paddingLeft: 12,
  },
  nestedStepsSummary: {
    paddingVertical: 8,
  },
  nestedStepsText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
}));

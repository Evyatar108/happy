import { RawJSONLines, RawJSONLinesSchema } from '../types';

// Strategy A: normalize Claude title-only JSONL records into synthetic summary messages
// so the existing summary metadata path and scanner dedup keep working unchanged.

type TitleEventType = 'custom-title' | 'ai-title';

type TitleFieldByEvent = {
    'custom-title': 'customTitle';
    'ai-title': 'aiTitle';
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeTitleEvent(
    message: Record<string, unknown>,
    type: TitleEventType,
    titleField: TitleFieldByEvent[TitleEventType],
): RawJSONLines | null {
    const summary = message[titleField];
    const sessionId = message.sessionId;
    if (typeof summary !== 'string' || typeof sessionId !== 'string') {
        return null;
    }

    return {
        type: 'summary',
        summary,
        leafUuid: `${type}:${sessionId}`,
    };
}

export function normalizeSessionLogMessage(message: unknown): RawJSONLines | null {
    if (isRecord(message)) {
        if (message.type === 'custom-title') {
            return normalizeTitleEvent(message, 'custom-title', 'customTitle');
        }
        if (message.type === 'ai-title') {
            return normalizeTitleEvent(message, 'ai-title', 'aiTitle');
        }
    }

    const parsed = RawJSONLinesSchema.safeParse(message);
    if (!parsed.success) {
        return null;
    }

    return parsed.data;
}

export function getSessionLogMessageKey(message: RawJSONLines): string {
    if (message.type === 'summary') {
        return `summary: ${message.leafUuid}: ${message.summary}`;
    }

    return message.uuid;
}

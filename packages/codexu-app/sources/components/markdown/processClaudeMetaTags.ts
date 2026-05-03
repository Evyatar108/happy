import { forkBoilerplateEntry, localCommandCaveatEntry, systemReminderEntry } from 'codexu-wire';

import { t } from '@/text';

type Logger = (message: string) => void;

const OPTIONS_SENTINEL_PREFIX = '__HAPPY_OPTIONS_BLOCK_';
const OPTIONS_SENTINEL_RE = /__HAPPY_OPTIONS_BLOCK_(\d+)__/g;
const OPTIONS_BLOCK_RE = /<options(?:\s[^>]*)?>[\s\S]*?<\/options>/gi;
const TASK_NOTIFICATION_SENTINEL_PREFIX = '__HAPPY_TASK_NOTIFICATION_';
const TASK_NOTIFICATION_SENTINEL_RE = /__HAPPY_TASK_NOTIFICATION_(\d+)__/g;
const TASK_NOTIFICATION_BLOCK_RE = /<task-notification(?:\s[^>]*)?>[\s\S]*?<\/task-notification>/gi;
const COMMAND_TAG_SEQUENCE_RE = /(?:<(?:command-name|command-message|command-args)(?:\s[^>]*)?>[\s\S]*?<\/(?:command-name|command-message|command-args)>\s*)+/gi;
const COMMAND_TAG_RE = /<(command-name|command-message|command-args)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const STDOUT_TAG_RE = /<local-command-stdout(?:\s[^>]*)?>([\s\S]*?)<\/local-command-stdout>/gi;
const STDERR_TAG_RE = /<local-command-stderr(?:\s[^>]*)?>([\s\S]*?)<\/local-command-stderr>/gi;
const ANY_TAG_RE = /<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>/gi;
const FENCE_COLLISION_RE = /```/g;
const FENCE_COLLISION_ESCAPE = '``\u200B`';

// Tolerant inner-tag extraction. Different Claude Code emitters produce
// different `<task-notification>` shapes:
//   - Task framework (terminal): task-id, [tool-use-id], task-type, output-file, status, summary
//   - Bash-hook background-task: task-id, tool-use-id, output-file, status, summary (no task-type)
//   - Monitor tool events: task-id, summary, event (no task-type, output-file, or status)
// Rather than maintain an anchored multi-shape regex, we require only the two
// universal fields — `<task-id>` and `<summary>` — and lift the other recognized
// inner tags as optional fields. Unknown inner tags (e.g. `<event>`) are tolerated
// silently so future Claude Code shapes don't fall through to raw-XML render.

export type TaskNotificationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed' | (string & {});

export type TaskNotificationData = {
    taskId: string;
    toolUseId?: string;
    taskType?: string;
    outputFile?: string;
    status?: TaskNotificationStatus;
    summary: string;
};

export type ProcessedClaudeMetaTags = {
    renderMarkdown: string;
    copyMarkdown: string;
    taskNotifications: TaskNotificationData[];
};

export const KNOWN_TAG_NAMES = new Set([
    'command-name',
    'command-message',
    'command-args',
    'local-command-stdout',
    'local-command-stderr',
    'local-command-caveat',
    'options',
    'option',
    'task-notification',
    'task-id',
    'tool-use-id',
    'task-type',
    'output-file',
    'status',
    'summary',
    // Emitted by Claude Code's Monitor tool inside <task-notification>. We don't
    // surface it as a typed field, but listing it here suppresses the warn-once
    // for "unknown tag" while the chip renders normally.
    'event',
    'system-reminder',
    'fork-boilerplate',
]);

export const warnedTagNames = new Set<string>();

let injectedLogger: Logger | null = null;

export function _setLogger(fn: Logger | null) {
    injectedLogger = fn;
}

function warnUnknownTag(tagName: string) {
    if (KNOWN_TAG_NAMES.has(tagName) || warnedTagNames.has(tagName)) {
        return;
    }

    warnedTagNames.add(tagName);

    if (injectedLogger) {
        injectedLogger(`[MarkdownView] unknown tag <${tagName}>`);
        return;
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[MarkdownView] unknown tag <${tagName}>`);
    }
}

function escapeFenceCollisions(content: string) {
    return content.replace(FENCE_COLLISION_RE, FENCE_COLLISION_ESCAPE);
}

function wrapFence(content: string) {
    return ['```', content, '```'].join('\n');
}

function protectOptions(raw: string) {
    const protectedBlocks: string[] = [];
    const out = raw.replace(OPTIONS_BLOCK_RE, (match) => {
        const sentinel = `${OPTIONS_SENTINEL_PREFIX}${protectedBlocks.length}__`;
        protectedBlocks.push(match);
        return sentinel;
    });

    return { out, protectedBlocks };
}

function restoreOptions(raw: string, protectedBlocks: string[]) {
    return raw.replace(OPTIONS_SENTINEL_RE, (match, indexText) => {
        const index = Number(indexText);
        return protectedBlocks[index] ?? match;
    });
}

type InnerTagMatch = { value: string; endIndex: number };

function extractFirstInnerTag(block: string, tagName: string): InnerTagMatch | null {
    const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i');
    const m = block.match(re);

    if (!m || m.index === undefined) {
        return null;
    }

    return { value: m[1].trim(), endIndex: m.index + m[0].length };
}

function parseTaskNotification(block: string): TaskNotificationData | null {
    const taskIdMatch = extractFirstInnerTag(block, 'task-id');
    const summaryMatch = extractFirstInnerTag(block, 'summary');

    if (!taskIdMatch || !summaryMatch) {
        return null;
    }

    const taskId = taskIdMatch.value;
    const summary = summaryMatch.value;

    if (!taskId || !summary) {
        return null;
    }

    // Defense against malformed payload: a literal `</summary>` inside the captured
    // summary, or a stray `</summary>` after we already closed one, signals that the
    // block is structurally broken (or attempting to inject content that masquerades
    // as a chip). Fall back to raw render in that case.
    if (/<\/summary>/i.test(summary)) {
        return null;
    }
    if (/<\/summary>/i.test(block.slice(summaryMatch.endIndex))) {
        return null;
    }

    const toolUseId = extractFirstInnerTag(block, 'tool-use-id')?.value || undefined;
    const taskType = extractFirstInnerTag(block, 'task-type')?.value || undefined;
    const outputFile = extractFirstInnerTag(block, 'output-file')?.value || undefined;
    const status = extractFirstInnerTag(block, 'status')?.value || undefined;

    return {
        taskId,
        ...(toolUseId ? { toolUseId } : {}),
        ...(taskType ? { taskType } : {}),
        ...(outputFile ? { outputFile } : {}),
        ...(status ? { status } : {}),
        summary,
    };
}

function protectTaskNotifications(raw: string) {
    const taskNotifications: TaskNotificationData[] = [];
    const out = raw.replace(TASK_NOTIFICATION_BLOCK_RE, (match, offset, fullString) => {
        const taskNotification = parseTaskNotification(match);

        if (!taskNotification) {
            return match;
        }

        const sentinel = `${TASK_NOTIFICATION_SENTINEL_PREFIX}${taskNotifications.length}__`;
        const startsOnOwnLine = offset === 0 || fullString[offset - 1] === '\n';
        const endsOnOwnLine = offset + match.length === fullString.length || fullString[offset + match.length] === '\n';

        taskNotifications.push(taskNotification);
        return `${startsOnOwnLine ? '' : '\n'}${sentinel}${endsOnOwnLine ? '' : '\n'}`;
    });

    return { out, taskNotifications };
}

function restoreTaskNotificationsForCopy(raw: string, taskNotifications: TaskNotificationData[]) {
    return raw.replace(TASK_NOTIFICATION_SENTINEL_RE, (match, indexText) => {
        const index = Number(indexText);
        return taskNotifications[index]?.summary ?? match;
    });
}

function stripWellFormedWrapper(raw: string, standaloneLineRe: RegExp, inlineRe: RegExp) {
    return raw
        .replace(standaloneLineRe, (_, leadingNewline: string, trailingNewline: string) => {
            if (leadingNewline && trailingNewline) {
                return '\n';
            }

            return '';
        })
        .replace(inlineRe, '');
}

function stripLocalCommandCaveats(raw: string) {
    const regexes = localCommandCaveatEntry.receiverRegexes!;
    return stripWellFormedWrapper(raw, regexes.buildStandaloneLineRe(), regexes.buildInlineRe());
}

function stripSystemReminders(raw: string) {
    const regexes = systemReminderEntry.receiverRegexes!;
    return stripWellFormedWrapper(raw, regexes.buildStandaloneLineRe(), regexes.buildInlineRe());
}

function stripForkBoilerplate(raw: string) {
    const regexes = forkBoilerplateEntry.receiverRegexes!;
    return stripWellFormedWrapper(raw, regexes.buildStandaloneLineRe(), regexes.buildInlineRe());
}

function collapseCommandTriplets(raw: string) {
    return raw.replace(COMMAND_TAG_SEQUENCE_RE, (match) => {
        const parts: string[] = [];
        let commandNameValue: string | null = null;

        for (const tagMatch of match.matchAll(COMMAND_TAG_RE)) {
            const tagName = tagMatch[1];
            const value = tagMatch[2].trim();

            if (value.length === 0) {
                continue;
            }

            if (tagName === 'command-name') {
                commandNameValue = value;
                parts.push(value);
            } else if (tagName === 'command-message' && commandNameValue !== null
                && value.replace(/^\//, '') === commandNameValue.replace(/^\//, '')) {
                // skip: duplicate of command-name (Claude often emits command-message without the leading slash)
            } else {
                parts.push(value);
            }
        }

        if (parts.length === 0) {
            return '';
        }

        return `\`${parts.join(' ')}\``;
    });
}

function renderStdoutFences(raw: string) {
    return raw.replace(STDOUT_TAG_RE, (_, content: string) => wrapFence(escapeFenceCollisions(content)));
}

function renderStderrFences(raw: string) {
    return raw.replace(STDERR_TAG_RE, (_, content: string) => {
        const label = t('chat.commandOutput.stderrLabel');
        return wrapFence(`# ${label}\n${escapeFenceCollisions(content)}`);
    });
}

function scanUnknownTags(raw: string) {
    for (const tagMatch of raw.matchAll(ANY_TAG_RE)) {
        const tagName = tagMatch[1].toLowerCase();
        warnUnknownTag(tagName);
    }
}

export default function processClaudeMetaTags(raw: string): ProcessedClaudeMetaTags {
    if (!raw.includes('<')) {
        return {
            renderMarkdown: raw,
            copyMarkdown: raw,
            taskNotifications: [],
        };
    }

    let out = raw;
    const { out: optionsProtected, protectedBlocks } = protectOptions(out);
    out = optionsProtected;
    const { out: taskNotificationsProtected, taskNotifications } = protectTaskNotifications(out);
    out = taskNotificationsProtected;
    out = stripLocalCommandCaveats(out);
    out = stripSystemReminders(out);
    out = stripForkBoilerplate(out);
    out = out.replace(/\n{3,}/g, '\n\n');
    const masked = out
        .replace(STDOUT_TAG_RE, '')
        .replace(STDERR_TAG_RE, '');
    scanUnknownTags(masked);
    out = collapseCommandTriplets(out);
    out = renderStdoutFences(out);
    out = renderStderrFences(out);
    const renderMarkdown = restoreOptions(out, protectedBlocks).replace(/\n{3,}/g, '\n\n');
    const copyMarkdown = restoreTaskNotificationsForCopy(renderMarkdown, taskNotifications).replace(/\n{3,}/g, '\n\n');

    return {
        renderMarkdown,
        copyMarkdown,
        taskNotifications,
    };
}

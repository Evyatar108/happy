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
const CAVEAT_TAG_RE = /<local-command-caveat(?:\s[^>]*)?>[\s\S]*?<\/local-command-caveat>/gi;
const CAVEAT_STANDALONE_LINE_RE = /(^|\n)<local-command-caveat(?:\s[^>]*)?>[\s\S]*?<\/local-command-caveat>(\n|$)/gi;
const SYSTEM_REMINDER_TAG_RE = /<system-reminder(?:\s[^>]*)?>[\s\S]*?<\/system-reminder>/gi;
const SYSTEM_REMINDER_STANDALONE_LINE_RE = /(^|\n)<system-reminder(?:\s[^>]*)?>[\s\S]*?<\/system-reminder>(\n|$)/gi;
const FORK_BOILERPLATE_TAG_RE = /<fork-boilerplate(?:\s[^>]*)?>[\s\S]*?<\/fork-boilerplate>/gi;
const FORK_BOILERPLATE_STANDALONE_LINE_RE = /(^|\n)<fork-boilerplate(?:\s[^>]*)?>[\s\S]*?<\/fork-boilerplate>(\n|$)/gi;
const ANY_TAG_RE = /<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>/gi;
const FENCE_COLLISION_RE = /```/g;
const FENCE_COLLISION_ESCAPE = '``\u200B`';

const TASK_NOTIFICATION_PATTERN = /^<task-notification(?:\s[^>]*)?>\s*<task-id(?:\s[^>]*)?>([\s\S]*?)<\/task-id>\s*(?:<tool-use-id(?:\s[^>]*)?>([\s\S]*?)<\/tool-use-id>\s*)?<task-type(?:\s[^>]*)?>([\s\S]*?)<\/task-type>\s*<output-file(?:\s[^>]*)?>([\s\S]*?)<\/output-file>\s*<status(?:\s[^>]*)?>([\s\S]*?)<\/status>\s*<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>\s*<\/task-notification>$/i;

export type TaskNotificationData = {
    taskId: string;
    toolUseId?: string;
    taskType: string;
    outputFile: string;
    status: string;
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

function containsLiteralInnerClosingTag(value: string) {
    return /<\/(?:task-id|tool-use-id|task-type|output-file|status|summary)>/i.test(value);
}

function parseTaskNotification(block: string): TaskNotificationData | null {
    const match = block.match(TASK_NOTIFICATION_PATTERN);

    if (!match) {
        return null;
    }

    const taskId = match[1].trim();
    const toolUseId = match[2]?.trim();
    const taskType = match[3].trim();
    const outputFile = match[4].trim();
    const status = match[5].trim();
    const summary = match[6].trim();

    if ([taskId, toolUseId, taskType, outputFile, status, summary].some(value => value && containsLiteralInnerClosingTag(value))) {
        return null;
    }

    if (!taskId || !taskType || !outputFile || !status || !summary) {
        return null;
    }

    return {
        taskId,
        ...(toolUseId ? { toolUseId } : {}),
        taskType,
        outputFile,
        status,
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
    return stripWellFormedWrapper(raw, CAVEAT_STANDALONE_LINE_RE, CAVEAT_TAG_RE);
}

function stripSystemReminders(raw: string) {
    return stripWellFormedWrapper(raw, SYSTEM_REMINDER_STANDALONE_LINE_RE, SYSTEM_REMINDER_TAG_RE);
}

function stripForkBoilerplate(raw: string) {
    return stripWellFormedWrapper(raw, FORK_BOILERPLATE_STANDALONE_LINE_RE, FORK_BOILERPLATE_TAG_RE);
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
    out = stripLocalCommandCaveats(out);
    out = stripSystemReminders(out);
    out = stripForkBoilerplate(out);
    out = out.replace(/\n{3,}/g, '\n\n');
    const { out: taskNotificationsProtected, taskNotifications } = protectTaskNotifications(out);
    out = taskNotificationsProtected;
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

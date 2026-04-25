import { t } from '@/text';

type Logger = (message: string) => void;

const OPTIONS_SENTINEL_PREFIX = '__HAPPY_OPTIONS_BLOCK_';
const OPTIONS_SENTINEL_RE = /__HAPPY_OPTIONS_BLOCK_(\d+)__/g;
const OPTIONS_BLOCK_RE = /<options(?:\s[^>]*)?>[\s\S]*?<\/options>/gi;
const COMMAND_TAG_SEQUENCE_RE = /(?:<(?:command-name|command-message|command-args)(?:\s[^>]*)?>[\s\S]*?<\/(?:command-name|command-message|command-args)>\s*)+/gi;
const COMMAND_TAG_RE = /<(command-name|command-message|command-args)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const STDOUT_TAG_RE = /<local-command-stdout(?:\s[^>]*)?>([\s\S]*?)<\/local-command-stdout>/gi;
const STDERR_TAG_RE = /<local-command-stderr(?:\s[^>]*)?>([\s\S]*?)<\/local-command-stderr>/gi;
const CAVEAT_TAG_RE = /<local-command-caveat(?:\s[^>]*)?>[\s\S]*?<\/local-command-caveat>/gi;
const ANY_TAG_RE = /<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>/gi;
const FENCE_COLLISION_RE = /```/g;
const FENCE_COLLISION_ESCAPE = '``\u200B`';

export const KNOWN_TAG_NAMES = new Set([
    'command-name',
    'command-message',
    'command-args',
    'local-command-stdout',
    'local-command-stderr',
    'local-command-caveat',
    'options',
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

function collapseCommandTriplets(raw: string) {
    return raw.replace(COMMAND_TAG_SEQUENCE_RE, (match) => {
        const parts: string[] = [];

        for (const tagMatch of match.matchAll(COMMAND_TAG_RE)) {
            const value = tagMatch[2].trim();
            if (value.length > 0) {
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
        return wrapFence(`${label}\n${escapeFenceCollisions(content)}`);
    });
}

function scanUnknownTags(raw: string) {
    for (const tagMatch of raw.matchAll(ANY_TAG_RE)) {
        const tagName = tagMatch[1].toLowerCase();
        warnUnknownTag(tagName);
    }
}

export default function processClaudeMetaTags(raw: string): string {
    if (!raw.includes('<')) {
        return raw;
    }

    let out = raw.replace(CAVEAT_TAG_RE, '');
    const { out: optionsProtected, protectedBlocks } = protectOptions(out);
    out = optionsProtected;
    out = collapseCommandTriplets(out);
    out = renderStdoutFences(out);
    out = renderStderrFences(out);
    scanUnknownTags(out);
    out = restoreOptions(out, protectedBlocks);

    return out;
}

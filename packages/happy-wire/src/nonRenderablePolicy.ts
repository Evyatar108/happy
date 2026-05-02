export interface RawClaudeMessageMatchInput {
  type: string;
  message: {
    content: unknown;
  };
}

export interface ReceiverRegexFactory {
  buildInlineRe(): RegExp;
  buildStandaloneLineRe(): RegExp;
}

export interface NonRenderableEntry {
  name: string;
  senderPredicate?: (raw: RawClaudeMessageMatchInput) => boolean;
  receiverRegexes?: ReceiverRegexFactory;
  receiverPrefix?: RegExp;
  receiverMatchSite: 'skill-body-prefix' | 'wrapped-tag';
}

const SKILL_BODY_PREFIX_RE = /^Base directory for this skill: \S[^\r\n]*\r?\n\r?\n# /;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMatchInput(raw: unknown): raw is RawClaudeMessageMatchInput {
  return isRecord(raw) && typeof raw.type === 'string' && isRecord(raw.message) && 'content' in raw.message;
}

type UserContentShape =
  | { shape: 'string'; text: string }
  | { shape: 'array1'; text: string };

function getUserContentShape(raw: RawClaudeMessageMatchInput): UserContentShape | null {
  if (raw.type !== 'user') {
    return null;
  }

  const { content } = raw.message;
  if (typeof content === 'string') {
    return { shape: 'string', text: content };
  }

  if (Array.isArray(content) && content.length === 1) {
    const [block] = content;
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      return { shape: 'array1', text: block.text };
    }
  }

  return null;
}

export function makeWrappedTagEntry(tagName: string): NonRenderableEntry {
  const inlineSource = `<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`;
  const standaloneLineSource = `(^|\\n)<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>(\\n|$)`;

  return {
    name: tagName,
    receiverMatchSite: 'wrapped-tag',
    receiverRegexes: {
      buildInlineRe: () => new RegExp(inlineSource, 'gi'),
      buildStandaloneLineRe: () => new RegExp(standaloneLineSource, 'gi'),
    },
  };
}

export const skillBodyEntry: NonRenderableEntry = {
  name: 'skill-body',
  receiverMatchSite: 'skill-body-prefix',
  receiverPrefix: SKILL_BODY_PREFIX_RE,
  senderPredicate: (raw) => {
    const shaped = getUserContentShape(raw);
    return shaped !== null && shaped.shape === 'array1' && SKILL_BODY_PREFIX_RE.test(shaped.text);
  },
};

export const localCommandCaveatEntry: NonRenderableEntry = {
  ...makeWrappedTagEntry('local-command-caveat'),
  senderPredicate: (raw) => {
    const shaped = getUserContentShape(raw);
    return (
      shaped !== null &&
      shaped.shape === 'string' &&
      /^\s*<local-command-caveat(?:\s[^>]*)?>[\s\S]*?<\/local-command-caveat>\s*$/i.test(shaped.text)
    );
  },
};

export const systemReminderEntry: NonRenderableEntry = makeWrappedTagEntry('system-reminder');
export const forkBoilerplateEntry: NonRenderableEntry = makeWrappedTagEntry('fork-boilerplate');

export const nonRenderableEntries: readonly NonRenderableEntry[] = [
  skillBodyEntry,
  localCommandCaveatEntry,
  systemReminderEntry,
  forkBoilerplateEntry,
];

// Do not add a thinking-block entry here. Extended thinking is renderable user
// value, and the optional renderer plan depends on keeping those blocks on the
// wire: docs/plans/render-extended-thinking-optional.md.
export function findSenderDropEntry(raw: unknown): NonRenderableEntry | null {
  if (!isMatchInput(raw)) {
    return null;
  }

  return nonRenderableEntries.find((entry) => entry.senderPredicate?.(raw)) ?? null;
}

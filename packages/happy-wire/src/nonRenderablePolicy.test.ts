import { describe, expect, it } from 'vitest';
import {
  findSenderDropEntry,
  forkBoilerplateEntry,
  localCommandCaveatEntry,
  skillBodyEntry,
  systemReminderEntry,
} from './nonRenderablePolicy';

describe('non-renderable content policy', () => {
  it('matches a Claude Code SKILL body user message', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: [
          {
            type: 'text',
            text: 'Base directory for this skill: C:\\Users\\foo\\.claude\\skills\\demo\n\n# Demo Skill\n\nInstructions',
          },
        ],
      },
    });

    expect(entry?.name).toBe('skill-body');
  });

  it('matches a standalone local-command-caveat user message', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: '<local-command-caveat>Use the shell carefully.</local-command-caveat>',
      },
    });

    expect(entry?.name).toBe('local-command-caveat');
  });

  it('does not drop a string-content user message that begins with the SKILL prefix', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: 'Base directory for this skill: C:\\tmp\n\n# Not injected',
      },
    });

    expect(entry).toBeNull();
  });

  it('does not drop a length-1 text-array user message whose body is a bare local-command-caveat tag', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: [{ type: 'text', text: '<local-command-caveat>Use the shell carefully.</local-command-caveat>' }],
      },
    });

    expect(entry).toBeNull();
  });

  it('does not match a SKILL prefix mentioned mid-paragraph', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: 'Earlier text. Base directory for this skill: C:\\tmp\n\n# Not injected',
      },
    });

    expect(entry).toBeNull();
  });

  it('does not match a local-command-caveat quoted inside a code block or discussion', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: 'Example:\n```xml\n<local-command-caveat>quoted</local-command-caveat>\n```',
      },
    });

    expect(entry).toBeNull();
  });

  it('does not drop standalone system-reminder because it is receiver-only', () => {
    const entry = findSenderDropEntry({
      type: 'user',
      message: {
        content: '<system-reminder>Remember this.</system-reminder>',
      },
    });

    expect(entry).toBeNull();
    expect(systemReminderEntry.senderPredicate).toBeUndefined();
  });

  it('thinking blocks must NOT be dropped', () => {
    const entry = findSenderDropEntry({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'Private reasoning that must stay on the wire for render policy.',
          },
        ],
      },
    });

    expect(entry).toBeNull();
  });

  it('keeps receiver regex and prefix contracts byte-compatible with the app literals', () => {
    expect(skillBodyEntry.receiverPrefix?.source).toBe('^Base directory for this skill: \\S[^\\r\\n]*\\r?\\n\\r?\\n# ');

    expect(localCommandCaveatEntry.receiverRegexes?.buildInlineRe().source).toBe(
      '<local-command-caveat(?:\\s[^>]*)?>[\\s\\S]*?<\\/local-command-caveat>',
    );
    expect(localCommandCaveatEntry.receiverRegexes?.buildStandaloneLineRe().source).toBe(
      '(^|\\n)<local-command-caveat(?:\\s[^>]*)?>[\\s\\S]*?<\\/local-command-caveat>(\\n|$)',
    );
    expect(systemReminderEntry.receiverRegexes?.buildInlineRe().source).toBe(
      '<system-reminder(?:\\s[^>]*)?>[\\s\\S]*?<\\/system-reminder>',
    );
    expect(systemReminderEntry.receiverRegexes?.buildStandaloneLineRe().source).toBe(
      '(^|\\n)<system-reminder(?:\\s[^>]*)?>[\\s\\S]*?<\\/system-reminder>(\\n|$)',
    );
    expect(forkBoilerplateEntry.receiverRegexes?.buildInlineRe().source).toBe(
      '<fork-boilerplate(?:\\s[^>]*)?>[\\s\\S]*?<\\/fork-boilerplate>',
    );
    expect(forkBoilerplateEntry.receiverRegexes?.buildStandaloneLineRe().source).toBe(
      '(^|\\n)<fork-boilerplate(?:\\s[^>]*)?>[\\s\\S]*?<\\/fork-boilerplate>(\\n|$)',
    );
  });

  it('builds fresh receiver regex instances', () => {
    const first = localCommandCaveatEntry.receiverRegexes?.buildInlineRe();
    const second = localCommandCaveatEntry.receiverRegexes?.buildInlineRe();

    expect(first).toBeInstanceOf(RegExp);
    expect(second).toBeInstanceOf(RegExp);
    expect(first).not.toBe(second);
  });
});

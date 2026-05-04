import { describe, expect, it } from 'vitest';

import { isSkillBodyMessage } from './skillBody';

describe('isSkillBodyMessage', () => {
    it('detects the canonical Claude Code skill-body injection (LF line endings)', () => {
        const text = [
            'Base directory for this skill: C:\\Users\\evmitran\\.claude\\plugins\\cache\\ai-developer-toolkit\\ralph-orchestration\\5.19.0\\skills\\implement-with-ralph',
            '',
            '# Implement with Ralph',
            '',
            'Full implementation workflow: plan, generate PRD, run autonomous agents, review, and iterate.',
        ].join('\n');

        expect(isSkillBodyMessage(text)).toBe(true);
    });

    it('detects the canonical Claude Code skill-body injection (CRLF line endings inside the body)', () => {
        // Real-world payload uses LF after the prefix but CRLF inside the body.
        const text =
            'Base directory for this skill: /home/user/.claude/plugins/cache/foo/1.0.0/skills/bar' +
            '\n\n# Bar Skill\r\n\r\nDoes things.\r\n';

        expect(isSkillBodyMessage(text)).toBe(true);
    });

    it('rejects a message that mentions the prefix mid-sentence', () => {
        const text = 'Hey, the docs say "Base directory for this skill: <path>" but I cannot find it.';

        expect(isSkillBodyMessage(text)).toBe(false);
    });

    it('rejects the prefix line without a following H1 heading', () => {
        const text = 'Base directory for this skill: /tmp/foo\n\nNo heading here.';

        expect(isSkillBodyMessage(text)).toBe(false);
    });

    it('rejects an empty path after the prefix', () => {
        const text = 'Base directory for this skill: \n\n# Heading';

        expect(isSkillBodyMessage(text)).toBe(false);
    });

    it('rejects empty / nullish input without throwing', () => {
        expect(isSkillBodyMessage('')).toBe(false);
        expect(isSkillBodyMessage(null)).toBe(false);
        expect(isSkillBodyMessage(undefined)).toBe(false);
    });

    it('rejects a normal user message starting with a heading', () => {
        const text = '# My notes\n\nSome content.';

        expect(isSkillBodyMessage(text)).toBe(false);
    });
});

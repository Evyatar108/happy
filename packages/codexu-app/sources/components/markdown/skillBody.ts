import { skillBodyEntry } from 'codexu-wire';

// Detects the verbatim SKILL.md body Claude Code injects right after every
// `Skill` tool_use/tool_result pair. The injected message is a copy of the
// skill's SKILL.md, prefixed with a single line that names the resolved plugin
// path, e.g.:
//
//   Base directory for this skill: C:\Users\foo\.claude\plugins\cache\<plugin>\<ver>\skills\<name>
//
//   # Implement with Ralph
//
//   Full implementation workflow: ...
//
// On the wire the message is `role:"user"`, but Happy's `typesRaw.ts`
// normalizer routes most non-string-content user messages through the
// **agent-text** path, NOT the user-text path — verified empirically on
// 2026-04-29 via `console.warn` in both blocks. So the suppression in
// `MessageView.tsx` lives in BOTH `UserTextBlock` and `AgentTextBlock`. Don't
// remove either guard.
//
// The Skill tool call itself already produces a wrench-icon ToolView, so the
// expanded body is redundant noise in the chat.
//
// The prefix line, the blank line, and the markdown H1 immediately after are
// the strongest minimal signal that distinguishes Claude-Code-injected skill
// bodies from anything a real user would type. We deliberately do NOT match
// stray mentions of "Base directory for this skill" elsewhere in a message.
const SKILL_BODY_PATTERN = skillBodyEntry.receiverPrefix!;

export function isSkillBodyMessage(text: string | null | undefined): boolean {
    if (!text) {
        return false;
    }

    return SKILL_BODY_PATTERN.test(text);
}

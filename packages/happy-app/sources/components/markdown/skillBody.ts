// Detects the user-role text message Claude Code injects right after a `Skill`
// tool_use/tool_result pair. The injected message is a verbatim copy of the
// skill's SKILL.md, prefixed with a single line that names the resolved plugin
// path, e.g.:
//
//   Base directory for this skill: C:\Users\foo\.claude\plugins\cache\<plugin>\<ver>\skills\<name>
//
//   # Implement with Ralph
//
//   Full implementation workflow: ...
//
// The Skill tool call itself already produces a wrench-icon ToolView, so the
// expanded body is redundant noise in the chat. We hide the whole bubble in
// `MessageView.tsx` when the text matches this shape.
//
// The prefix line, the blank line, and the markdown H1 immediately after are
// the strongest minimal signal that distinguishes Claude-Code-injected skill
// bodies from anything a real user would type. We deliberately do NOT match
// stray mentions of "Base directory for this skill" elsewhere in a message.
const SKILL_BODY_PATTERN = /^Base directory for this skill: \S[^\r\n]*\r?\n\r?\n# /;

export function isSkillBodyMessage(text: string | null | undefined): boolean {
    if (!text) {
        return false;
    }

    return SKILL_BODY_PATTERN.test(text);
}

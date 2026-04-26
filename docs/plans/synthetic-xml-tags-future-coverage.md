# Synthetic XML Tags Future Coverage

This note is the repo-side pointer for the Claude Code synthetic XML tag survey used by the task-notification work.

- Full survey artifact: [claude-code-tag-survey.md](../../../../jobs/task-notification-pill/claude-code-tag-survey.md)
- Current shipped handling in Happy:
  - `<task-notification>` renders as a clickable pill with a detail modal.
  - `<system-reminder>` is stripped before markdown render/copy.
  - `<fork-boilerplate>` is stripped before markdown render/copy.
- Deferred / informational tag families remain documented in the job-dir survey so future agents can extend `processClaudeMetaTags(...)` without redoing the upstream investigation.

Use this doc as the stable link target from [fork-notes.md](../fork-notes.md). The survey itself stays in the Ralph job directory because it is a planning artifact tied to this implementation batch.

# Happy Wire Notes

## Session Protocol

- `sessionProtocol.ts` includes the additive `agent-configuration-changed` audit envelope with optional `permissionMode`, `model`, `thinkingLevel`, and `sandbox` string fields. In the current drawer slice this is schema-only: app and CLI control changes flow through session metadata echo, and the CLI does not emit the audit envelope.

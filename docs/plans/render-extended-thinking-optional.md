# Render Extended Thinking Optional

This plan tracks the optional app-side rendering path for Claude assistant `thinking` content blocks. The wire must continue carrying those blocks; hiding or showing them is a presentation choice in happy-app, not a sender-side data retention rule.

## Cross-links

- `packages/happy-wire/src/nonRenderablePolicy.ts` is the source of truth for non-renderable sender and receiver policy. It explicitly forbids adding a thinking-block entry, so future sender filters cannot drop extended thinking before it reaches encrypted session storage.
- `packages/happy-app/sources/components/MessageView.tsx` currently gates display through the `isThinking` early return. Treat that branch as the feature gate for this plan, not as dead rendering code.

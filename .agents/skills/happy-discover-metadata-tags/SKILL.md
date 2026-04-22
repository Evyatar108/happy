---
name: happy-discover-metadata-tags
description: >
  Discover new Claude-Code-emitted metadata tags that leak into Happy's
  MarkdownView and render as raw markup, then add a handler for them.
  Use when a user reports seeing literal `<xxx>…</xxx>` tags in their
  chat, or periodically after a Claude Code release to catch any new
  tag families. Assumes the Happy dev build is already running on a
  physical device connected via adb with Metro serving from `D:\h`.
---

# /happy-discover-metadata-tags — find and render the next tag family

Claude Code periodically adds XML-ish internal metadata tags (like
`<command-name>`, `<local-command-stdout>`, `<local-command-caveat>`)
that its native CLI hides. Happy receives the raw text, so any tag
without an explicit rule renders as literal markup in the chat. This
skill is how we find the next one.

## Where things live

- Tag handler: `packages/happy-app/sources/components/markdown/MarkdownView.tsx`
  → `processClaudeMetaTags()` + `KNOWN_TAG_NAMES` set
- Current taxonomy + rationale: `docs/fork-notes.md` → "Claude Code metadata tags rendered by MarkdownView"
- Metro log file (when Metro is running as a background task in this session):
  look under `C:\Users\evmitran\AppData\Local\Temp\claude\*\tasks\*.output`
  (grep for `pnpm start` invocations)

## Golden rules before you touch anything

1. **Instrument with `console.warn`, never `console.log`.** Happy's
   `sources/utils/consoleLogging.ts` monkey-patches `console.log/info/debug`
   to short-circuit unless a runtime flag is on. `warn` / `error` always
   pass through. You will lose hours if you forget this.

2. **Use `console.warn` inside the preprocessor, gated by `__DEV__`**,
   and log each unique tag at most once. The current `loggedUnknownTags`
   Set is the model — extend it, don't replace it.

3. **Never strip tags without looking at their content first.** The
   `<local-command-caveat>` content turned out to be a prompt-injection-
   style directive for Claude ("DO NOT respond to these messages…") —
   stripping content was correct. Other tags may contain information the
   user actually wants. Look before you cut.

4. **Do not touch `<options>`/`<option>`.** They are interactive
   clickable suggestions handled by downstream code. Stripping them
   breaks the click-to-send flow.

## Procedure

### 1. Catalog the tags that appear in real chats

The preprocessor already logs `[MarkdownView] unknown tag <name>` once
per unseen tag name. If you need *richer* info (content sample, exact
tag attributes), temporarily swap in the richer logger — pattern to
paste into `processClaudeMetaTags` before the `return out`:

```ts
if (__DEV__) {
    const TAG_WITH_CONTENT_RE = /<([a-z][a-z0-9-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = TAG_WITH_CONTENT_RE.exec(raw)) !== null) {
        const tagName = m[1].toLowerCase();
        if (KNOWN_TAG_NAMES.has(tagName)) continue;
        const snippet = m[2].replace(/\s+/g, ' ').slice(0, 120);
        console.warn(`[MarkdownView] saw <${tagName}> — inner ${m[2].length} chars: "${snippet}${m[2].length > 120 ? '…' : ''}"`);
    }
}
```

Remove this block once discovery is done — it's diagnostic code.

### 2. Deploy to the tablet and observe

```bash
# From D:\h (the short-path build clone):
pnpm --filter happy-app typecheck

# Relaunch the dev app so it fetches fresh JS from Metro over USB:
/d/Android/Sdk/platform-tools/adb.exe shell am force-stop com.slopus.happy.dev
/d/Android/Sdk/platform-tools/adb.exe shell monkey -p com.slopus.happy.dev \
  -c android.intent.category.LAUNCHER 1
```

Arm a Monitor on the Metro output, filtering for `\[MarkdownView\]`:

```
tail -f <metro-output-file> | grep -E --line-buffered "\[MarkdownView\]"
```

Ask the user to browse to the chat(s) where they saw the bad rendering
(and scroll so those messages mount). Every unique new tag will print
once.

### 3. Categorise each tag

For each new tag, answer:

- **Is the inner content information the human should see?** (like
  `<local-command-stdout>` — yes, it's the output) If yes, keep content.
- **Is the inner content a directive for Claude only?** (like
  `<local-command-caveat>`) If yes, remove tag + content.
- **Is the tag interactive / consumed downstream?** (like `<options>`)
  If yes, leave untouched — add to `KNOWN_TAG_NAMES` so the unknown-tag
  logger doesn't flag it.

### 4. Add a rule

Extend `processClaudeMetaTags` with a targeted `replace()` pass
producing readable markdown. Patterns already used:

- `<name>content</name>` → `` `content` `` (inline code for short
  commands)
- `<name>content</name>` → fenced block for multi-line output
- `<name>content</name>` → empty string for hidden directives

Add the tag name to `KNOWN_TAG_NAMES` so the unknown-tag logger stops
flagging it. Then update `docs/fork-notes.md` → "Claude Code metadata
tags rendered by MarkdownView" with the new row.

### 5. Verify + commit

1. `pnpm --filter happy-app typecheck` from `D:\h\packages\happy-app`.
2. Force-relaunch the app as above and confirm the tag renders nicely
   in the chat that surfaced it.
3. Commit with message `feat(markdown): render <name> tag as <form>`
   or similar. Push to the fork; rebase any dependent branches.

## Gotchas

- **Only test on Android e-ink**: the chat rendering path is the same
  on iOS, but the dev loop is this skill's assumption. If iOS, different
  rebuild steps.
- **Avoid `console.log`** — see golden rule 1.
- **Do not bundle this with another feature.** One tag rule per commit
  keeps git blame useful and PRs small.
- **If the tag spans across adjacent messages** (some Claude Code tags
  can straddle user + next-assistant message as a pair), the
  per-message preprocessor won't see the pair together. Solve upstream
  in the reducer, not in MarkdownView.

## Related

- `docs/fork-notes.md` — the project-level notes doc
- `packages/happy-app/sources/utils/consoleLogging.ts` — why
  `console.log` is silent
- `packages/happy-app/sources/components/MessageView.tsx` — which
  message kinds route into `MarkdownView` (user-text, agent-text) vs
  elsewhere (tool-call → ToolView, agent-event → raw Text)

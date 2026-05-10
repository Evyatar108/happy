# Experimental Chat File Links

## Problem

Codex is emitting local file references as absolute-path markdown links because the upstream prompt bundle says:

- `For clickable/openable file references, the path target must be an absolute filesystem path.`
- `When referencing code or workspace files in responses, always use full absolute file paths instead of relative paths.`

Happy does not currently implement that contract. The chat renderer only handles:

- explicit markdown links
- bare `http(s)` URLs

That creates two broken cases:

1. Absolute markdown file links are treated as ordinary browser links on web, so `/Users/.../file.ts:12` becomes `http://localhost/...`.
2. Bare relative file refs like `packages/foo.ts:12` are rendered as plain text because they are never auto-linkified.

## Goals

- Enable the feature by default for any session that has a resolvable session root; do not put it behind an experiments setting.
- Support both absolute and relative file refs in chat.
- Route file refs into the internal file viewer instead of the browser.
- Canonicalize paths before calling the RPC layer.
- Keep external links working exactly as they do today.

## Control Flow

1. Parse markdown as today.
2. When rendering spans (`addSessionFileLinks` / `addSessionFileLinksToSpans` in `packages/happy-app/sources/components/markdown/MarkdownView.tsx`):
   - The session-aware post-processing pass runs unconditionally for any session whose `useSession(props.sessionId ?? '')` lookup yields a `metadata.path` (the session root). When there is no session root, the parsed blocks are returned untouched.
   - If a span is inline code, do not auto-link file refs.
   - If a span already has a URL, leave it alone (only fully-plain spans are scanned).
   - If a span is plain text, scan whitespace-delimited tokens for file refs.
3. If a candidate parses as a file ref:
   - Resolve it to one canonical absolute path.
   - Build an internal `happy-file:` span URL via `buildInternalFileLinkUrl(absolutePath, line, column)` (see `packages/happy-app/sources/components/markdown/linkUtils.ts`).
   - On press, `RenderSpans` routes the URL through `onLinkPress`, which decodes it with `parseInternalFileLinkUrl` and pushes `/session/:id/file?path=<base64url(abs)>&line=<n>&column=<n>&refresh=1&view=file`.
   - Do not expose it as a browser `href`; the link is rendered as tappable text only.
4. In the file viewer:
   - Decode the incoming path.
   - Resolve relative input against the session root.
   - Normalize to a canonical absolute path.
   - Read the file through RPC using the canonical absolute path.
   - If the file is inside the session root, compute a repo-relative path for `git diff`.
   - If the file is outside the session root, skip diff and show the file directly.
5. In the RPC layer:
   - Resolve the incoming path to a canonical absolute path.
   - Validate access using the canonical absolute path.
   - Read/write/list using the canonical absolute path, not the raw input.

## Supported Cases

- Explicit markdown absolute links like `[foo.ts:12](/Users/me/repo/foo.ts:12)`
- Explicit markdown relative links like `[foo.ts:12](packages/app/foo.ts:12)`
- Bare absolute refs like `/Users/me/repo/foo.ts:12`
- Bare relative refs like `packages/app/foo.ts:12`
- Optional `:line`
- Optional `:line:column`
- Windows drive paths like `C:\repo\foo.ts:12`

## Rejected Cases

- External URLs like `https://...`
- URI schemes like `mailto:` and `node:`
- Plain prose tokens that do not look file-like
- Inline code spans and fenced code blocks

## Route URL Contract

The viewer route is `/session/:id/file` and accepts these query parameters (decoder lives in `packages/happy-app/sources/app/(app)/session/[id]/file.tsx`):

- `path` — base64url-encoded (RFC 4648 §5) absolute or relative filesystem path. Both producers in the tree emit base64url:
  - `packages/happy-app/sources/components/FilesSidebar.tsx` calls `encodeBase64Url(file.fullPath)` for the Changes sidebar.
  - `packages/happy-app/sources/components/markdown/linkUtils.ts` `buildInternalFileLinkUrl(...)` encodes via `encodeBase64Url` for in-chat file links.
  - The decoder (`decodeBase64Url` in `file.tsx`) accepts standard base64 as a back-compat fallback, mapping `+`/`/` to `-`/`_`, restoring padding, and reinserting any `+` that got rewritten to space by URL parsing. New links MUST be base64url.
- `line=<n>` (optional) — line number to scroll near after the viewer renders.
- `column=<n>` (optional) — column hint, currently consumed only for forward compatibility alongside `line`.
- `refresh=1` (optional) — forces a remote re-fetch and ignores the Zustand `useSessionFileCache` content for both file and diff. When omitted, the viewer paints cached content immediately on revisit.
- `view=file|diff` (optional) — forces the initial display mode. Any other value is ignored and the viewer falls back to its default selection logic.

## Viewer Semantics

- The route accepts either absolute or relative `path` values for backwards compatibility.
- Internally, the viewer normalizes to a canonical absolute path.
- Diff view is shown only when the file is inside the session root and `git diff` returns content; when `view=file` is requested explicitly, the `git diff` fetch is skipped.
- `view=file` forces the file pane on first render; `view=diff` forces the diff pane.
- `line` and `column` scroll within whichever pane the URL resolved to (`file.tsx` only performs the line-offset scroll when `displayMode === 'file'`).
- When `view` is absent, the viewer falls back to legacy auto-selection: an explicit `line > 0` opens file view, otherwise diff content is preferred and the viewer falls back to file content if no diff is available.

## RPC Semantics

- `validatePath()` should return the resolved canonical path.
- Callers should use `resolvedPath` for filesystem operations.
- This keeps the app and CLI aligned on one path representation.

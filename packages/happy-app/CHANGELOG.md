# Changelog

## Version 28 - 2026-04-30

Scrolling back through long chats is even smoother. The older-message prefetch now starts earlier and preloads the next page on chat open, so the first scroll-up no longer pauses while a fresh batch is fetched.

- Improved older-history prefetch to fire sooner during an upward scroll, so a steady scroll lands on already-loaded messages instead of stalling at the edge.
- Cold-start chat opening now eagerly preloads one page of older history in the background, so the first scroll-up after opening a long chat is instant.

## Version 27 - 2026-04-29

Two chat-rendering fixes for Claude Code sessions. Background-task notifications from Claude Code's Monitor tool — which only carry a task id, a summary, and an event line (no status, no output file) — now render as a proper info chip instead of leaking through as raw `<task-notification>` XML in the message body. And the verbatim copy of every loaded skill's `SKILL.md` that Claude Code injects after a Skill tool call no longer floods the chat with hundreds of lines of internal markdown — the wrench-icon Skill tool block on its own already shows the call.

- Task notification chips render reliably across every Claude Code variant we have observed (terminal task framework, bash-hook background tasks, Monitor-tool events). Only `task-id` + `summary` are required now; everything else is optional and unknown inner tags are tolerated silently, so future variants are non-breaking by default.
- Notifications without a status field show a neutral info icon instead of the misleading "pending" hourglass, and the detail modal hides empty rows for missing fields.
- Hid the verbatim `SKILL.md` body that Claude Code injects as a user-role message after each Skill tool call. The Skill tool block is unchanged.

## Version 26 - 2026-04-29

Scrolling back through long chats is much smoother. The next chunk of older messages now arrives over the live socket connection a beat before you scroll there, instead of waiting on a one-shot HTTP fetch when you reach the edge. The new path is on by default; you can flip it off in Settings → Appearance ("Stream Older Messages") if you ever want to fall back to the legacy HTTP behavior. The setting is local to the device (does not sync across devices).

- Older history now arrives slightly ahead of the scroll edge instead of in one large blocking batch, so the chat reads more fluidly on long sessions — on by default.
- Added a "Stream Older Messages" toggle to Settings → Appearance so you can flip the behavior off if you prefer the legacy HTTP path.
- Picking and switching sessions resets the prefetch state so the next session starts with a clean window without lingering requests from the previous one.
- Network reconnects abandon any in-flight prefetch and reissue cleanly on the next scroll instead of leaving the chat stuck waiting for an old request that will never arrive.
- Cold-start chat opening and live new-message updates are unchanged.

## Version 25 - 2026-04-28

Permission mode is now preserved when bridging your local Claude CLI session to the Happy mobile app. If you start `claude --dangerously-skip-permissions` (or any non-default permission mode) on your local terminal, sending or resuming the conversation from your phone no longer silently reverts you to the default mode.

- Fixed permission mode being silently reset to default when sending the first message from the Happy app to a local CLI session running with `--dangerously-skip-permissions`.
- Fixed the same regression on the resume path when reopening a CLI conversation from the app.
- The picker chip and the session info sheet now reflect the CLI's actual permission mode (including `yolo` for sandboxed Codex sessions) when you haven't explicitly chosen a mode in the app yet.
- The picker continues to honor your explicit choice once you tap it; auto-derived mode changes (such as entering or exiting plan mode) no longer count as an explicit pick.

## Version 24 - 2026-04-27

Long file-edit previews in chat are easier to scan now. Write, Edit, and MultiEdit tool bubbles collapse their diff to the first 10 visible lines by default, with an e-ink-safe Show / Hide toggle that expands the full content on demand. The remaining lines are summarized inline so you know what is hidden.

- Added a Show / Hide toggle on Write, Edit, and MultiEdit tool bubbles that collapses the diff preview to 10 lines and expands it on tap.
- Reused the precomputed diff hunks across the collapsed and expanded views so opening a long edit doesn't re-run the diff.
- Added the new `tools.diff.showMore` and `tools.diff.collapse` strings across all 11 supported languages.

## Version 23 - 2026-04-27

Chat titles now stay in sync wherever you rename them. Renaming a live chat from Happy updates the title immediately, and titles chosen by Claude itself now flow back into the app instead of getting lost or showing different names in different places.

- Added `/rename` to the live-session composer flow and slash-command picker so you can rename an active chat without leaving the conversation.
- Synced Claude-native rename events and auto-generated titles back into Happy so they update the same chat-name field as in-app renames.
- Fixed the remaining title mismatch points so renamed chats show the same name in the command palette and in local-mode Claude sessions.

## Version 22 - 2026-04-26

Tappable option cards in chat are now visible on color e-ink tablets. Both the `<options>` picker blocks and the AskUserQuestion tool prompts had near-white backgrounds and faint borders that quantized to pure white on BOOX-style panels, making the cards disappear into the page.

- Restyled `<options>` markdown blocks with a higher-contrast card fill, a thicker dark border, and a leading accent bar so each option reads as a clearly tappable target on e-ink.
- Restyled the AskUserQuestion option buttons the same way, including a stronger selected-state fill and a leading accent bar that marks the chosen item without relying on a faint background tint.

## Version 21 - 2026-04-26

Claude Code metadata inside chat bubbles is cleaner and more readable. Background task updates now show up as compact status pills you can tap for details, while model-only scaffolding tags no longer leak into the conversation text.

- Added clickable task notification pills for Claude Code background-task updates, with a detail sheet that shows status, task identifiers, output file, and the full summary.
- Improved long-press text copy for task notifications so the text-selection screen gets the human-readable summary instead of raw XML metadata.
- Removed leaked `<system-reminder>` and `<fork-boilerplate>` blocks from rendered chat bubbles and copied text.

## Version 20 - 2026-04-26

Tablet chats now have a faster way to reclaim horizontal space. A new width picker lives next to the existing Aa control, so you can dial the side margin in one tap.

- Added a Chat Width picker next to the chat input's Aa button on tablet layouts. The chips show the side-margin percentage directly: `0` (full width), `3`, `5`, `10`, `15`.
- The selection persists in `chatWidthMode` so message column, header, and composer stay aligned across reloads.

## Version 19 - 2026-04-25

Claude Code metadata no longer leaks raw XML-like tags into chat bubbles. Slash commands now read like commands again, command output shows up as clean code blocks, and the options UI keeps working instead of being flattened into plain text.

- Added slash-command rendering so Claude Code command tags like `/exit` and `/run --fast` show up as inline command pills instead of raw markup.
- Added clean fenced blocks for local command output, including labeled stderr blocks when a command reports an error.
- Removed hidden command caveat lines from rendered messages and copied text so chat stays readable.
- Preserved interactive `<options>` blocks while cleaning the surrounding metadata tags, so option pickers still render normally.

## Version 18 - 2026-04-25

A quicker way to change chat text size: a numbered picker now lives next to the settings gear under the chat input. Tap a number from 1 to 9 to jump straight to that size — no more digging into Settings or wrestling with pinch gestures on e-ink.

- Added a Text Size picker (numbered 1 through 9) next to the chat input settings gear. Each chip is a discrete size step from 0.85× up to 1.5×, with chip 4 set to the default 1.0×.
- Settings → Appearance and pinch-to-zoom (when enabled) remain alternative controls — the picker shares the same chat font-scale store so all three stay in sync.
- Translated the new "TEXT SIZE" header into all 10 supported languages (en, ru, pl, es, ca, it, pt, ja, zh-Hans, zh-Hant).

## Version 17 - 2026-04-25

Pinch-to-zoom now behaves like live text growth instead of scaling whole message bubbles. While you hold the gesture, every visible chat glyph grows together across markdown, code, diffs, tool output, and agent events, while the surrounding chrome stays fixed.

- Replaced the old whole-message pinch transform with per-text worklet animation so markdown, code blocks, diffs, tool output, and agent event lines all grow together while you hold the pinch.
- Kept bubble chrome, icons, padding, borders, and image surfaces on their original size path so the gesture feels like text resizing instead of page zoom.
- Promoted the animated-text BOOX probe into a permanent dev artifact and regenerated the in-app changelog data for the new release entry.

## Version 16 - 2026-04-25

This follow-up closes the last chat text-size coverage gap left by the previous scaling update. Inline `code` inside regular chat messages now grows and shrinks with the same slider as the surrounding text, so mixed-format sentences no longer break visual consistency.

- Fixed inline `code` text inside markdown chat messages so it now follows the chat text-size slider instead of staying at a fixed size.
- Closed the remaining coverage gap from the earlier uniform chat font-scaling pass, so inline code now matches the surrounding body text and fenced code blocks at every chat text size.

## Version 15 - 2026-04-25

The chat text-size slider now scales the remaining fixed-size text surfaces, so code blocks, markdown extras, tool chrome, and system event lines all grow and shrink together instead of mixing sizes inside one conversation.

- Fixed fenced code blocks and their language labels so they now scale together with the rest of the chat text.
- Fixed markdown image captions, clickable option buttons, and table text so those body elements now follow the same chat text-size setting as paragraphs.
- Fixed command blocks, tool section titles, and agent event lines so tool output and system status text resize at the same proportional rate as regular chat messages.
- Kept the shared file viewer on its original sizing path, so changing chat text size does not alter the standalone file screen.
## Version 14 - 2026-04-24

Tablet users can now reshape the sidebar to match how they read. Three modes — full sessions list, a 72-pixel icon rail, or fully hidden for distraction-free reading — replace the previous fixed-width sidebar. Especially helpful on e-ink tablets where every pixel of chat real estate counts.

- Added a three-state tablet sidebar: tap the chevron on the sidebar's right edge to toggle between expanded (full list) and collapsed (icon rail with avatars), or use the eye-off button in the sidebar header to hide it entirely.
- Added a small floating menu button on the home screen for restoring the sidebar from the fully-hidden state. On a chat screen, the same restore button lives next to the back button so it never overlaps native chrome.
- Added avatars, an inbox shortcut, a settings shortcut, and a compact "+" button to the new icon-rail mode so the most common actions are still one tap away.
- All sidebar controls now show proper labels in your language (English, Spanish, Catalan, Italian, Japanese, Polish, Portuguese, Russian, Simplified Chinese, Traditional Chinese).

## Version 13 - 2026-04-24

Long chats now open faster on slower devices like e-ink tablets. Instead of waiting for the entire message history to download before the chat appears, the most recent messages load first and older history loads on demand as you scroll back.

- Improved cold-open speed for long chats — the chat appears as soon as the most recent messages arrive, instead of waiting for the full history to finish loading.
- Added lazy-loading for older messages — scroll up or use page-turn mode to fetch older history a page at a time, only when needed.
- Fixed a sync bug where a tool result from a newer batch could get dropped if its matching tool call hadn't loaded yet from older history; tool results now wait for their call to arrive before attaching.

## Version 12 - 2026-04-24

Hygiene update that closes two gaps in the chat text-size feature and makes the Plugins/Skills/Agents catalog screens self-explanatory while a fresh session is warming up.

- Fixed the chat text-size slider not scaling the inline tool-error line and the permission prompt buttons; everything in a tool call now resizes together.
- Fixed the full-screen tool detail view leaving its section titles, descriptions, and empty-state text at fixed size instead of following the chat text size.
- Added a short explanation to the Plugins, Skills, and Agents screens so when the list hasn't loaded yet the loader says "Session hasn't loaded yet — send any message first" instead of leaving you guessing.

## Version 11 - 2026-04-23

The Plugins, Skills, and Agents screens now show their loaded contents for sessions started from the terminal (not just from the mobile app). A visible loading state replaces the old blank "No plugins loaded" flash while the session is warming up.

- The Plugins, Skills, and Agents screens now populate for terminal-launched sessions, matching what app-launched sessions already showed.
- Added a "Loading…" indicator on each of the three catalog screens during the brief window after opening a session, so the list no longer appears to be empty before it finishes loading.

## Version 10 - 2026-04-22

Claude Code plugins and skills now have full visibility and navigation inside Happy. The slash-command picker stops hiding most of what your session actually knows about, seven terminal-only commands finally have a useful mobile landing, and three new session screens show you what's loaded.

- Added plugin-provided slash commands and skills to the `/` picker — up to 15 suggestions at once instead of the old two.
- Added seven built-in TUI commands (`/plugin`, `/skills`, `/agents`, `/memory`, `/model`, `/mcp`, `/help`) to the picker — the three session-scoped ones open a catalog screen, the others show a "run in terminal" hint.
- Added "Plugins", "Skills", and "Agents" screens reachable from the session info screen, showing exactly what's loaded in the current session.
- Fixed `enabledPlugins` silently disappearing when Happy launched Claude Code — the root cause of plugin skills being invisible in prior versions.

## Version 9 - 2026-04-15

Voice reliability, better content rendering, and a new diff viewer.

- Fixed voice calls breaking on second session — works reliably every time now
- Tables and code blocks scroll horizontally instead of overflowing
- New diff viewer with syntax highlighting and unified/split toggle (desktop and web only)
- Model and effort level choices now persist on mobile
- Permission prompts (accept/reject) no longer get lost
- Settings no longer randomly reset during sync
- Added scroll-to-bottom button in chat
- Delete machines you no longer use from settings

## Version 7 - 2026-04-08

This preview release expands the current update with the latest Gemini models, a smarter voice onboarding flow, and more reliable Happy CLI sessions for plan approvals and Codex turns.

- Update Happy CLI with `npm i -g happy`
- Added the latest Gemini models to the picker
- Improved voice onboarding with smarter first-run prompts and clearer upgrade guidance for free users
- Fixed Happy CLI plan approval flows so Accept and Reject buttons show up reliably in plan mode
- Fixed Happy CLI background task updates and Codex turns that could sometimes hang or fail to complete

## Version 6 - 2026-03-19

This is the biggest update since launch — a redesigned session creation experience, Git worktree management, expanded agent support.

- New session composer screen with machine selection, worktree picker, draft persistence, and offline machine visibility.
- Git worktree management — list, create, and select worktrees from the app. Worktrees auto-cleanup on session delete.
- Automatic plan mode switching when your agent enters planning mode.
- OpenClaw added as a selectable AI agent alongside Claude Code and Codex.
- Session quick actions for faster interaction with active sessions.
- Session resume support — pick up where you left off.
- Delete sessions directly from the session info screen.
- Renamed "bypass" permission mode to "yolo" with updated styling.
- Improved markdown rendering and message formatting.
- Improved message sync reliability with edge case fixes.
- Various UI polish: send spinner, hidden internal tool calls, improved spacing.

## Version 5 - 2025-12-22

This release expands AI agent support and refines the voice experience, while improving markdown rendering for a better chat experience.

- We are working on adding Gemini support using ACP and hopefully fixing codex stability issues using the same approach soon! Stay tuned.
- Removed model configurations from agents. We were not able to keep up with the models so for now we are removing the configuration from the mobile app. You can still configure it through your CLIs, happy will simply use defaults.
- Elevenlabs ... is epxensive. Voice conversations will soon require a subscription after 3 free trials - we'll soon allow connecting your own ElevenLabs agent if you want to manage your own spendings.
- Improved markdown table rendering in chat - no more ASCII pipes `|--|`, actual formatted tables (layout still needs work, but much better!)

## Version 4 - 2025-09-12

This release revolutionizes remote development with Codex integration and Daemon Mode, enabling instant AI assistance from anywhere. Start coding sessions with a single tap while maintaining complete control over your development environment.

- Introduced Codex support for advanced AI-powered code completion and generation capabilities.
- Implemented Daemon Mode as the new default, enabling instant remote session initiation without manual CLI startup.
- Added one-click session launch from mobile devices, automatically connecting to your development machine.
- Added ability to connect anthropic and gpt accounts to account

## Version 3 - 2025-08-29

This update introduces seamless GitHub integration, bringing your developer identity directly into Happy while maintaining our commitment to privacy and security.

- Added GitHub account connection through secure OAuth authentication flow
- Integrated profile synchronization displaying your GitHub avatar, name, and bio
- Implemented encrypted token storage on our backend for additional security protection
- Enhanced settings interface with personalized profile display when connected
- Added one-tap GitHub disconnect functionality with confirmation protection
- Improved account management with clear connection status indicators

## Version 2 - 2025-06-26

This update focuses on seamless device connectivity, visual refinements, and intelligent voice interactions for an enhanced user experience.

- Added QR code authentication for instant and secure device linking across platforms
- Introduced comprehensive dark theme with automatic system preference detection
- Improved voice assistant performance with faster response times and reduced latency
- Added visual indicators for modified files directly in the session list
- Implemented preferred language selection for voice assistant supporting 15+ languages

## Version 1 - 2025-05-12

Welcome to Happy - your secure, encrypted mobile companion for Claude Code. This inaugural release establishes the foundation for private, powerful AI interactions on the go.

- Implemented end-to-end encrypted session management ensuring complete privacy
- Integrated intelligent voice assistant with natural conversation capabilities
- Added experimental file manager with syntax highlighting and tree navigation
- Built seamless real-time synchronization across all your devices
- Established native support for iOS, Android, and responsive web interfaces

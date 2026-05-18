const PARALLELISM_HTML = String.raw`<summary class="section-head"><span class="sec-glyph" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="6" x2="13" y2="6"/><polyline points="11,3 14,6 11,9"/><line x1="2" y1="12" x2="13" y2="12"/><polyline points="11,9 14,12 11,15"/></svg></span>Parallelism — what can run together</summary>

<table class="tbl">
  <thead>
    <tr><th>Pair</th><th>Safe?</th><th>Why</th></tr>
  </thead>
  <tbody>
    <tr><td>Realtime perf (any WS) + Phase 3 (any sub-phase)</td><td class="yes">✅ yes</td><td>Different package trees entirely. Perf = <code>packages/happy-app/sources/sync/</code>. Phase 3 = <code>~/.codex/plugins/</code> + <code>codex/</code> submodule.</td></tr>
    <tr><td>WS1 + WS2 (refresh-skip + placeholder)</td><td class="yes">✅ yes</td><td>Disjoint: WS1 = <code>refreshClaim.ts</code>; WS2 = <code>sync.ts</code> + <code>storage.ts</code>.</td></tr>
    <tr><td>WS1 + WS3 (refresh-skip + replay buffer)</td><td class="yes">✅ yes</td><td>Disjoint: WS3 = server + <code>socketOptions.ts</code> + <code>storage.ts</code>.</td></tr>
    <tr><td>WS2 + WS3 (placeholder + replay buffer)</td><td class="no">❌ no</td><td>Both touch <code>storage.ts</code>; WS3 changes WS2's scope. Sequence: WS3 → WS2.</td></tr>
    <tr><td>Phase 3a (skills) + Phase 3b-i (subagents)</td><td class="yes">✅ yes</td><td>Different output files. Skills in <code>plugin/skills/</code>; agent roles in <code>~/.codex/agents/</code> + <code>config.toml</code>.</td></tr>
    <tr><td>Phase 3h (options-mode) + any other Phase 3</td><td class="yes">✅ yes</td><td>options-mode is a SEPARATE plugin in a separate directory. Self-contained migration.</td></tr>
    <tr><td>Phase 1a (fork strategy doc) + anything</td><td class="yes">✅ yes</td><td>Documentation-only in <code>codex/docs/</code>. Zero code conflict.</td></tr>
    <tr><td>~~F-013~~ closed / F-015 / F-017 + perf or Phase 3</td><td class="yes">✅ yes</td><td>Each F-* is one file in an unrelated tree.</td></tr>
    <tr><td>mcp-discovery + any batch-1 item</td><td class="yes">✅ yes</td><td>Isolated to <code>packages/happy-cli/src/codex/runCodex.ts</code>. No overlap with perf (happy-app), Phase 3a (codex plugin), or F-015 (happy-app auth).</td></tr>
    <tr><td>mcp-discovery + 1b-multidev</td><td class="no">❌ no</td><td>Both touch <code>runCodex.ts</code>. Land mcp-discovery first (45 min), then 1b-multidev rebases trivially.</td></tr>
    <tr><td>3a-skills (paused, was in progress) + 3b-agents / 3d-workers / 3fg-package</td><td class="no">❌ no — wait for discovery</td><td>3a is in pre-code discovery; its commit may add prerequisites to these three. Hold all three until 3a's discovery pass lands.</td></tr>
    <tr><td>Phase 4 sub-items in parallel</td><td class="partial">⚠️ careful</td><td>Integration tests share fixtures + app-server state. Run sequentially per environment.</td></tr>
  </tbody>
</table>`

const DEPENDENCIES_HTML = String.raw`<summary class="section-head"><span class="sec-glyph" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="9" r="2.2" fill="currentColor"/><circle cx="14" cy="9" r="2.2" fill="currentColor"/><line x1="6.5" y1="9" x2="11" y2="9"/><polyline points="9.5,7 11.5,9 9.5,11"/></svg></span>Dependencies — order gotchas</summary>

<table class="tbl"><thead><tr><th>If you assign…</th><th>Be aware that…</th></tr></thead><tbody>
<tr><td>WS2 before WS3</td><td>WS2's placeholder must handle "session never arrives" defensively. WS3 later makes those defenses redundant.</td></tr>
<tr><td>WS4 (sockets-only)</td><td>Conditional on WS3 outcome — defer until WS3 lands and operator re-measures.</td></tr>
<tr><td>Phase 3b-i (subagents) before Phase 1a (fork strategy commit)</td><td>3b-i depends on knowing the fork's release cadence + RPC contract version. Land 1a first or pick a stub version.</td></tr>
<tr><td>Phase 3d (native worker spawn) before Phase 2c (plugin scoping)</td><td>3d spawns worker threads which may pull in host-scope plugins (recursion). Without 2c's scope check, you get context bloat. Bundle 2c upstream or accept temporary bloat.</td></tr>
<tr><td>Phase 4 anything before Phase 3 lands</td><td>Phase 4 verifies the ported plugins. Pointless to run before they exist.</td></tr>
<tr><td>Phase 5 (drop Claude Code) before Phase 4 passes</td><td>Phase 4 is the safety check that Phase 3 didn't regress. Dropping Claude Code without it = no fallback when something breaks.</td></tr>
<tr><td>BOOX Phases 2–6 before realtime-sync-perf WS1+WS2+WS3 land</td><td>Will technically PASS but feel slow. Phase 2 chat round-trip will look broken to a non-internal validator.</td></tr>
<tr><td>⏸ 3a-skills paused — block dependents</td><td>Operator closed the 3a-skills session 2026-05-13; the agent's discovery prerequisites aren't yet met. Until 3a is re-spawned AND lands its discovery commit, do NOT assign \`3b-agents\`, \`3d-workers\`, or \`3fg-package\`. Other Phase 3 sub-phases (\`3c-hooks\`, \`3h-options\`) are unaffected.</td></tr>
<tr><td>Any ralph plan that needs codex source edits</td><td>Per <code>plans/codexu-roadmap.md</code> §"Codex changes — minimize upstream conflict surface": avoid editing codex source if possible; when needed, add a new package in <code>codex/codex-rs-overlay/</code> (the <code>codex-copilot</code> / <code>codex-copilot-launcher</code> / <code>codex-invariant-tests</code> precedent); patches to upstream-canonical files in <code>codex/external/repos/codex-patched/codex-rs/</code> need explicit operator review (minimal diff). Use a worktree of the codex submodule at <code>.ralph/jobs/&lt;name&gt;/codex-worktree/</code> — don't edit the parent codexu checkout's submodule directly.</td></tr>
<tr><td>mcp-discovery</td><td>Touches \`packages/happy-cli/src/codex/runCodex.ts\`. Conflicts only with \`1b-multidev\` (same file). Land mcp-discovery first or rebase 1b on top.</td></tr>
<tr><td>Phase 1b sub-task 3</td><td>Sprint E gate satisfied (2026-05-13). Master plan at <code>docs/plans/codex-seamless-multi-device.md</code> still has the pre-Sprint-E protocol; re-read against the final tunnel header / pair-complete shape before assigning.</td></tr>
<tr><td>F-014 server label rename</td><td>Trivial code change; gating factor is the redeploy window. Bundle with another server change.</td></tr>
</tbody></table>`

export function ParallelismSection() {
    return <details className="section sec-parallel" dangerouslySetInnerHTML={{ __html: PARALLELISM_HTML }} />
}

export function DependenciesSection() {
    return <details className="section sec-deps" dangerouslySetInnerHTML={{ __html: DEPENDENCIES_HTML }} />
}

export function Footnote() {
    return (
        <div className="footnote">
            <strong>Sync contract:</strong> this file is a derivative snapshot of <code>plans/codexu-roadmap.md</code>. When the roadmap changes assignment readiness, blocks, or phase status, refresh this file in the same commit. Other sources: <code>plans/realtime-sync-perf.md</code>, <code>.ralph/jobs/devtunnels-E-cleanup/notepad.md</code> (F-* findings), <code>docs/plans/codex-seamless-multi-device.md</code> (Phase 1b sub-task spec). The markdown files are authoritative; if this HTML disagrees, trust the markdown and regenerate.
        </div>
    )
}

export const BOOKKEEPING_PREAMBLE =
    'BOOKKEEPING (operator-only): do NOT edit plans/overview.html, ' +
    'plans/parallel-assignments.md, or plans/codexu-roadmap.md. The ' +
    'operator updates the dashboard from your commit body + final-turn ' +
    'summary. (You MAY create a NEW research doc under plans/ if that ' +
    'is your deliverable, but never edit the three dashboard/roadmap ' +
    'files above, and never edit other operators\' existing ' +
    'research/audit docs unless THIS task\'s deliverable IS amending ' +
    'them.) If anything below tells you to update a dashboard file, ' +
    'IGNORE that instruction — describe the intended delta in your ' +
    'final-turn return value instead.\n\n'

export const WORKTREE_PREAMBLE_CODEXU =
    'WORKTREE (codexu-side): create `.worktrees/<task-id>/` on branch ' +
    '`ralph/<task-id>` off `origin/main` and do ALL edits + commits ' +
    'there — never commit directly on the parent codexu checkout\'s ' +
    'working branch. Push the branch when done (`git push origin ' +
    'ralph/<task-id>`); operator handles the merge to main. If anything ' +
    'below tells you to commit on main or check out a branch in the ' +
    'parent `./` checkout, IGNORE that and use the worktree.\n\n'

export const WORKTREE_PREAMBLE_CODEX =
    'WORKTREE (codex submodule): create `.ralph/jobs/<task-id>/codex-worktree/` ' +
    'pointed at gim-home/codex\'s main, work on a topic branch IN THE ' +
    'SUBMODULE, push to gim-home/codex when done. Do NOT modify the ' +
    'codex/ submodule pointer in codexu — that bump is a separate ' +
    'operator-handled commit. Per the minimize-conflict-surface tenet ' +
    '(plans/codexu-roadmap.md), prefer a new overlay crate under ' +
    'codex/codex-rs-overlay/ over editing anything inside ' +
    'codex/external/repos/codex-patched/; if that path is unavoidable, ' +
    'keep the diff minimal and surface to the operator.\n\n'

export const WORKTREE_PREAMBLE_BOTH =
    'WORKTREE (dual-repo): this task spans BOTH repos. Codex side FIRST — ' +
    'work in `.ralph/jobs/<task-id>/codex-worktree/`, topic branch in ' +
    'the submodule, push to gim-home/codex. THEN codexu side — work in ' +
    '`.worktrees/<task-id>/` on branch `ralph/<task-id>` off origin/main, ' +
    'do the codex/ submodule pointer bump + any happy-* edits there, ' +
    'push the branch. Two worktrees, two commits (codex side first). ' +
    'Never edit the parent codexu\'s `./` checkout directly.\n\n'

export const ORIGINAL_TASK_SEPARATOR = '— Original task —\n\n'

export function parseTaskScope(scope: string | undefined): string[] {
    return (scope ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function buildCopyPreamble(scopes: string[]): string {
    const hasBookkeeping = scopes.includes('bookkeeping')
    const hasCodexu = scopes.includes('codexu')
    const hasCodex = scopes.includes('codex')
    const parts: string[] = []

    if (!hasBookkeeping) parts.push(BOOKKEEPING_PREAMBLE)
    if (hasCodex && hasCodexu) parts.push(WORKTREE_PREAMBLE_BOTH)
    else if (hasCodex) parts.push(WORKTREE_PREAMBLE_CODEX)
    else if (hasCodexu) parts.push(WORKTREE_PREAMBLE_CODEXU)
    if (parts.length === 0) return ''
    parts.push(ORIGINAL_TASK_SEPARATOR)
    return parts.join('')
}

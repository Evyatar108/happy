export interface DerivePRLinksOptions {
    groupState?: { prUrl?: unknown } | null
    repoRoot: string
    branchName?: string | null
    stage?: string | null
    originUrl?: string | null
}

export interface DerivedPRLinks {
    branchName?: string
    prUrl?: string
    mergeCommit?: string
}

export function derivePRLinks(options: DerivePRLinksOptions): DerivedPRLinks

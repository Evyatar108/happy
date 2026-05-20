export function toPosix(value: string): string
export function splitPath(value: string): string[]
export function globToRegExp(pattern: string): RegExp
export function compileIgnoredPatterns(patterns: string[] | undefined): RegExp[]
export function matchesIgnored(filePath: string, repoRoot: string, ignored: string[] | RegExp[], altRoot?: string): boolean
export function resolveHeadShortSha(repoRoot: string, options?: { onError?: (error: unknown) => void }): string

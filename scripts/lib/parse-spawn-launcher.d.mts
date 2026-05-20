export interface SpawnLauncherParseResult {
    initialPrompt: string | null
    memberName: string | null
    crewName: string | null
}

export function parseSpawnLauncher(absolutePath: string): SpawnLauncherParseResult

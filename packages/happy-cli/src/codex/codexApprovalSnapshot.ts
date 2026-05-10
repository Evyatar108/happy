type FileChanges = Record<string, unknown>;

export function snapshotCodexFileChanges(fileChanges: FileChanges | undefined): FileChanges | undefined {
    if (!fileChanges) {
        return undefined;
    }

    return structuredClone(fileChanges) as FileChanges;
}

export function createCodexPatchApprovalInput(fileChanges: FileChanges | undefined): { changes: FileChanges | undefined } {
    return { changes: snapshotCodexFileChanges(fileChanges) };
}

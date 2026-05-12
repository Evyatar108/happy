declare function applyOwnerOnlyPerms(filePath: string): Promise<void>;

declare function writeJsonAtomically(filePath: string, value: unknown): Promise<void>;

export { applyOwnerOnlyPerms, writeJsonAtomically };

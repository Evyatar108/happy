import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface PathValidationResult {
    valid: boolean;
    resolvedPath?: string;
    error?: string;
}

/**
 * Validates that a path is within the allowed working directory
 * @param targetPath - The path to validate (can be relative or absolute)
 * @param workingDirectory - The session's working directory (must be absolute)
 * @returns Validation result
 */
export function validatePath(targetPath: string, workingDirectory: string): PathValidationResult {
    // Resolve both paths to absolute paths to handle path traversal attempts
    const resolvedTarget = resolve(workingDirectory, targetPath);
    const resolvedWorkingDir = resolve(workingDirectory);

    // Check if the resolved target path starts with the working directory
    // Uses path.sep to work correctly on both Windows (\) and Unix (/)
    if (!resolvedTarget.startsWith(resolvedWorkingDir + sep) && resolvedTarget !== resolvedWorkingDir) {
        return {
            valid: false,
            resolvedPath: resolvedTarget,
            error: `Access denied: Path '${targetPath}' is outside the working directory`
        };
    }

    return { valid: true, resolvedPath: resolvedTarget };
}

function isWithinPath(candidatePath: string, rootPath: string): boolean {
    const pathFromRoot = relative(rootPath, candidatePath);
    return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

/**
 * Validates confinement through the deepest existing ancestor and rejects symlink path segments.
 */
export async function validatePathRealpath(targetPath: string, workingDirectory: string): Promise<PathValidationResult> {
    const lexicalValidation = validatePath(targetPath, workingDirectory);
    if (!lexicalValidation.valid || !lexicalValidation.resolvedPath) {
        return lexicalValidation;
    }

    const resolvedWorkingDir = resolve(workingDirectory);
    const resolvedTarget = lexicalValidation.resolvedPath;

    try {
        const realWorkingDir = await realpath(resolvedWorkingDir);
        const relativeTarget = relative(resolvedWorkingDir, resolvedTarget);
        const pathSegments = relativeTarget === '' ? [] : relativeTarget.split(sep).filter(Boolean);
        let currentPath = resolvedWorkingDir;
        let deepestExistingPath = resolvedWorkingDir;

        for (const segment of pathSegments) {
            currentPath = join(currentPath, segment);
            try {
                const stats = await lstat(currentPath);
                if (stats.isSymbolicLink()) {
                    return {
                        valid: false,
                        resolvedPath: resolvedTarget,
                        error: `Access denied: Path '${targetPath}' resolves through a symbolic link`
                    };
                }
                deepestExistingPath = currentPath;
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    break;
                }
                if (nodeError.code === 'ELOOP') {
                    return {
                        valid: false,
                        resolvedPath: resolvedTarget,
                        error: `Access denied: Path '${targetPath}' resolves through a symbolic-link loop`
                    };
                }
                throw error;
            }
        }

        const realDeepestExistingPath = await realpath(deepestExistingPath);
        if (!isWithinPath(realDeepestExistingPath, realWorkingDir)) {
            return {
                valid: false,
                resolvedPath: resolvedTarget,
                error: `Access denied: Path '${targetPath}' resolves outside the working directory`
            };
        }

        return { valid: true, resolvedPath: resolvedTarget };
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ELOOP') {
            return {
                valid: false,
                resolvedPath: resolvedTarget,
                error: `Access denied: Path '${targetPath}' resolves through a symbolic-link loop`
            };
        }
        return {
            valid: false,
            resolvedPath: resolvedTarget,
            error: error instanceof Error ? error.message : `Access denied: Failed to validate path '${targetPath}'`
        };
    }
}

import * as z from 'zod';

export function warnToolInputParseFailure(toolName: string, error: z.ZodError, userMessage: string): string {
    const issue = error.issues[0];
    const issuePath = issue?.path.length ? issue.path.join('.') : 'input';
    const issueSummary = issue ? `${issuePath}: ${issue.message}` : 'unknown issue';
    console.warn(`[${toolName}] Zod parse failed: ${issueSummary}`);
    return userMessage;
}

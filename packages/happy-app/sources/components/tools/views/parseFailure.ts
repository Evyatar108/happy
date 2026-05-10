import * as z from 'zod';

export function warnToolInputParseFailure(toolName: string, error: z.ZodError): string {
    const issue = error.issues[0];
    const issuePath = issue?.path.length ? issue.path.join('.') : 'input';
    const issueSummary = issue ? `${issuePath}: ${issue.message}` : 'unknown issue';
    const message = `[${toolName}] Zod parse failed: ${issueSummary}`;
    console.warn(message);
    return message;
}

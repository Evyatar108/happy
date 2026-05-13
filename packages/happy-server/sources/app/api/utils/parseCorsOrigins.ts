export function parseCorsOrigins(): string[] {
    const raw = process.env.HAPPY_CORS_ORIGINS;
    if (!raw) {
        return [];
    }
    const entries = raw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    for (const entry of entries) {
        if (entry.includes('*')) {
            throw new Error(`HAPPY_CORS_ORIGINS rejects wildcard entries (got "${entry}"); wildcards are incompatible with credentialed CORS and are a known browser exploitation vector.`);
        }
    }
    return entries;
}

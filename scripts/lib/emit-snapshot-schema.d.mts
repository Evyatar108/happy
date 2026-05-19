export type JsonSchema = Record<string, unknown>

export const SNAPSHOT_SCHEMA: JsonSchema

export function writeSnapshotSchema(schemaPath: string): void

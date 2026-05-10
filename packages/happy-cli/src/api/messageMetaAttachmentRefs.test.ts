import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MessageMetaSchema as CliMessageMetaSchema } from './types'

async function loadMessageMetaSchema(relativePath: string) {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const moduleUrl = pathToFileURL(resolve(currentDir, relativePath)).href
  const mod = await import(moduleUrl) as { MessageMetaSchema: { parse(value: unknown): unknown } }
  return mod.MessageMetaSchema
}

describe('attachmentRefs message metadata schemas', () => {
  it('preserves attachment refs in app, wire, and cli schemas', async () => {
    const AppMessageMetaSchema = await loadMessageMetaSchema('../../../happy-app/sources/sync/typesMessageMeta.ts')
    const WireMessageMetaSchema = await loadMessageMetaSchema('../../../happy-wire/src/messageMeta.ts')
    const meta = {
      attachmentRefs: [
        { remotePath: '.happy/attachments/local-1/file.txt', name: 'file.txt', size: 42 },
      ],
    }

    expect(AppMessageMetaSchema.parse(meta)).toEqual(meta)
    expect(WireMessageMetaSchema.parse(meta)).toEqual(meta)
    expect(CliMessageMetaSchema.parse(meta)).toEqual(meta)
  })
})

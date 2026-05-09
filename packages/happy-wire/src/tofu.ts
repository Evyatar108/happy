import * as z from 'zod';

export const TofuPublicKeysSchema = z.object({
  ed25519PublicKey: z.string().min(1),
  x25519PublicKey: z.string().min(1),
  ed25519Fingerprint: z.string().min(1).optional(),
});
export type TofuPublicKeys = z.infer<typeof TofuPublicKeysSchema>;

export const TofuPubkeysEventSchema = z.object({
  t: z.literal('tofu-pubkeys'),
  keys: TofuPublicKeysSchema,
});
export type TofuPubkeysEvent = z.infer<typeof TofuPubkeysEventSchema>;

export const TofuSessionKeyExchangeSchema = z.object({
  t: z.literal('tofu-session-key'),
  machineId: z.string().min(1),
  mobileX25519PublicKey: z.string().min(1),
  serverX25519PublicKey: z.string().min(1),
  sessionKey: z.string().min(1),
  firstSeenAt: z.number(),
});
export type TofuSessionKeyExchange = z.infer<typeof TofuSessionKeyExchangeSchema>;

export const TofuHandshakeMessageSchema = z.discriminatedUnion('t', [
  TofuPubkeysEventSchema,
  TofuSessionKeyExchangeSchema,
]);
export type TofuHandshakeMessage = z.infer<typeof TofuHandshakeMessageSchema>;

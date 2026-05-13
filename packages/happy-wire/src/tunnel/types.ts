import * as z from 'zod';

export const MachineTunnelSchema = z.object({
  machineId: z.string(),
  tunnelId: z.string(),
  url: z.string(),
  tags: z.array(z.string()),
  lastSeenAt: z.union([z.number(), z.string().datetime()]),
  owner: z.string(),
});
export type MachineTunnel = z.infer<typeof MachineTunnelSchema>;

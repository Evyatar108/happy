import { z } from 'zod';

export const TunnelConfigSchema = z.object({
  tunnelId: z.string().min(1),
  tunnelName: z.string().min(1),
  tunnelUrl: z.string().url(),
  createdAt: z.string().datetime(),
  refreshedAt: z.string().datetime().optional(),
});

export type TunnelConfig = z.infer<typeof TunnelConfigSchema>;


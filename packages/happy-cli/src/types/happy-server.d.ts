declare module 'happy-server' {
  import type { FastifyInstance } from 'fastify';

  export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
    localUserId?: string;
    tofuPublicKeys?: {
      ed25519PublicKey: string | Uint8Array;
      ed25519SecretKey?: Uint8Array;
      x25519PublicKey: string | Uint8Array;
      x25519SecretKey?: Uint8Array;
      ed25519Fingerprint?: string;
    };
    host?: string;
    publicUrl?: string;
    enablePrettyLogs?: boolean;
  }

  export interface HappyServerHandle {
    app: FastifyInstance;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  }

  export function createHappyServer(config: HappyServerConfig): HappyServerHandle;
}

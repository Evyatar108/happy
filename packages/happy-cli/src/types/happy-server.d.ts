declare module 'happy-server' {
  import type { FastifyInstance } from 'fastify';

  export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
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

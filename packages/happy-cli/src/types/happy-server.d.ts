declare module 'happy-server' {
  import type { FastifyInstance } from 'fastify';

  export interface ApiPaths {
    profile?: string;
    accountSettings?: string;
    loopbackCap?: string;
  }

  export interface MachineSelfState {
    machineId: string;
    hostname: string;
    tunnelPort: number;
    loopbackPort: number;
    tunnelUrl: string;
    lastSeenAt: number | string;
    owner: string;
  }

  export type MachineStateGetter = () => MachineSelfState | Promise<MachineSelfState>;

  export interface TofuPublicKeys {
    ed25519PublicKey: string | Uint8Array;
    x25519PublicKey: string | Uint8Array;
    x25519SecretKey?: Uint8Array;
    ed25519Fingerprint?: string;
  }

  export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
    localUserId?: string;
    tofuPublicKeys?: TofuPublicKeys;
    host?: string;
    publicUrl?: string;
    auth?: 'tunnel' | 'loopback';
    paths?: ApiPaths;
    machineState?: MachineStateGetter;
    enablePrettyLogs?: boolean;
  }

  export interface HappyServerSharedContext {
    dataDir: string;
    machineKey: string | Uint8Array;
    localUserId?: string;
    tofuPublicKeys?: TofuPublicKeys;
    publicUrl?: string;
    enablePrettyLogs?: boolean;
  }

  export interface CreateAppConfig extends HappyServerSharedContext {
    port: number;
    host?: string;
    auth?: 'tunnel' | 'loopback';
    paths?: ApiPaths;
    machineState?: MachineStateGetter;
  }

  export interface HappyServerHandle {
    app: FastifyInstance;
    eventRouter: unknown;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  }

  export interface BootstrapMachineForEmbeddedInput {
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64?: string | null;
  }

  export function createApp(config: CreateAppConfig): HappyServerHandle;
  export function createHappyServer(config: HappyServerConfig): HappyServerHandle;
  export function bootstrapMachineForEmbedded(input: BootstrapMachineForEmbeddedInput): Promise<void>;
}

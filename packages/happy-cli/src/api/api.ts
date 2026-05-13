import { logger } from '@/ui/logger'
import type { AgentState, CreateSessionResponse, Machine, Metadata, Session } from '@/api/types'
import { ApiSessionClient } from './apiSession';
import { ApiMachineClient } from './apiMachine';
import { decodeBase64, encodeBase64, getRandomBytes, encrypt, decrypt, libsodiumEncryptForPublicKey } from './encryption';
import { configuration } from '@/configuration';
import { Credentials } from '@/persistence';
import { connectionState, isNetworkError } from '@/utils/serverConnectionErrors';
import * as daemonClient from '@/daemon/daemonClient';

const SESSION_PATH = '/v1/sessions';

export class ApiClient {

  static async create(credential: Credentials) {
    return new ApiClient(credential);
  }

  private readonly credential: Credentials;

  private constructor(credential: Credentials) {
    this.credential = credential
  }

  /**
   * Create a new session or load existing one with the given tag
   */
  async getOrCreateSession(opts: {
    tag: string,
    metadata: Metadata,
    state: AgentState | null
  }): Promise<Session | null> {

    // Resolve encryption key
    let dataEncryptionKey: Uint8Array | null = null;
    let encryptionKey: Uint8Array;
    let encryptionVariant: 'legacy' | 'dataKey';
    if (this.credential.encryption.type === 'dataKey') {

      // Generate new encryption key
      encryptionKey = getRandomBytes(32);
      encryptionVariant = 'dataKey';

      // Derive and encrypt data encryption key
      // const contentDataKey = await deriveKey(this.secret, 'Happy EnCoder', ['content']);
      // const publicKey = libsodiumPublicKeyFromSecretKey(contentDataKey);
      let encryptedDataKey = libsodiumEncryptForPublicKey(encryptionKey, this.credential.encryption.publicKey);
      dataEncryptionKey = new Uint8Array(encryptedDataKey.length + 1);
      dataEncryptionKey.set([0], 0); // Version byte
      dataEncryptionKey.set(encryptedDataKey, 1); // Data key
    } else {
      encryptionKey = this.credential.encryption.secret;
      encryptionVariant = 'legacy';
    }

    // Create session
    try {
      const response = await daemonClient.tunnelFetch(
        SESSION_PATH,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Happy-Client': `cli-coding-session/${configuration.currentCliVersion}`
          },
          body: JSON.stringify({
            tag: opts.tag,
            metadata: JSON.stringify(opts.metadata),
            agentState: opts.state ? JSON.stringify(opts.state) : null,
            dataEncryptionKey: null,
          }),
        }
      )

      if (response.status === 404) {
        connectionState.fail({
          operation: 'Session creation',
          errorCode: '404',
          url: SESSION_PATH
        });
        return null;
      }

      if (response.status >= 500) {
        connectionState.fail({
          operation: 'Session creation',
          errorCode: String(response.status),
          url: SESSION_PATH,
          details: ['Server encountered an error, will retry automatically']
        });
        return null;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json() as CreateSessionResponse;

      logger.debug(`Session created/loaded: ${data.session.id} (tag: ${opts.tag})`)
      let raw = data.session;
      let session: Session = {
        id: raw.id,
        seq: raw.seq,
        metadata: JSON.parse(raw.metadata),
        metadataVersion: raw.metadataVersion,
        agentState: raw.agentState ? JSON.parse(raw.agentState) : null,
        agentStateVersion: raw.agentStateVersion,
        encryptionKey: encryptionKey,
        encryptionVariant: encryptionVariant
      }
      return session;
    } catch (error) {
      logger.debug('[API] [ERROR] Failed to get or create session:', error);

      // Check if it's a connection error
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        if (isNetworkError(errorCode)) {
          connectionState.fail({
            operation: 'Session creation',
            caller: 'api.getOrCreateSession',
            errorCode,
            url: SESSION_PATH
          });
          return null;
        }
      }

      throw new Error(`Failed to get or create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  sessionSyncClient(session: Session): ApiSessionClient {
    return new ApiSessionClient(this.credential.token, session);
  }

  machineSyncClient(machine: Machine): ApiMachineClient {
    return new ApiMachineClient(this.credential.token, machine);
  }
}

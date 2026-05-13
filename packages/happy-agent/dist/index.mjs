import { Command } from 'commander';
import { homedir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, openSync, closeSync, chmodSync, renameSync, unlinkSync, fsyncSync } from 'node:fs';
import { setTimeout as setTimeout$1 } from 'node:timers/promises';
import { randomBytes, createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import tweetnacl from 'tweetnacl';
import axios, { AxiosError } from 'axios';
import { MachineTunnelSchema, LedgerRecordSchema } from '@slopus/happy-wire';
import { io } from 'socket.io-client';
import { EventEmitter } from 'node:events';
import { mkdir, appendFile, readFile } from 'node:fs/promises';

const LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
function isInsecureRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return !LOCAL_HOSTS.has(host);
}
function enforceTransportSecurity(envVar, rawUrl) {
  if (!rawUrl || !isInsecureRemoteUrl(rawUrl)) {
    return;
  }
  const message = `${envVar} uses http:// for a non-localhost host (${rawUrl}); credentials and device codes would be transmitted in cleartext.`;
  if (process.env.HAPPY_ALLOW_INSECURE === "1" || process.env.NODE_ENV === "development") {
    console.warn(message);
    return;
  }
  throw new Error(`${message} Set HAPPY_ALLOW_INSECURE=1 to override (development/test only).`);
}
function loadConfig() {
  enforceTransportSecurity("HAPPY_SERVER_URL", process.env.HAPPY_SERVER_URL);
  enforceTransportSecurity("HAPPY_PAIRING_URL", process.env.HAPPY_PAIRING_URL);
  const legacyServerUrl = (process.env.HAPPY_SERVER_URL ?? "https://api.cluster-fluster.com").replace(/\/+$/, "");
  const pairingBaseUrl = (process.env.HAPPY_PAIRING_URL ?? legacyServerUrl).replace(/\/+$/, "");
  const homeDir = process.env.HAPPY_AGENT_HOME_DIR ?? join(homedir(), ".happy-agent");
  if (process.env.HAPPY_HOME_DIR && !process.env.HAPPY_AGENT_HOME_DIR) {
    console.warn("HAPPY_HOME_DIR is deprecated for happy-agent credentials; use HAPPY_AGENT_HOME_DIR. HAPPY_HOME_DIR is only used for legacy agent.key lookup.");
  }
  const credentialPath = join(homeDir, "credentials.json");
  return { legacyServerUrl, pairingBaseUrl, homeDir, credentialPath };
}

function encodeBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}
function decodeBase64(base64) {
  return new Uint8Array(Buffer.from(base64, "base64"));
}
function getRandomBytes(size) {
  return new Uint8Array(randomBytes(size));
}
function hmac_sha512(key, data) {
  const hmac = createHmac("sha512", key);
  hmac.update(data);
  return new Uint8Array(hmac.digest());
}
function deriveSecretKeyTreeRoot(seed, usage) {
  const I = hmac_sha512(new TextEncoder().encode(usage + " Master Seed"), seed);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32)
  };
}
function deriveSecretKeyTreeChild(chainCode, index) {
  const data = new Uint8Array([0, ...new TextEncoder().encode(index)]);
  const I = hmac_sha512(chainCode, data);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32)
  };
}
function deriveKey(master, usage, path) {
  let state = deriveSecretKeyTreeRoot(master, usage);
  for (const index of path) {
    state = deriveSecretKeyTreeChild(state.chainCode, index);
  }
  return state.key;
}
function deriveContentKeyPair(secret) {
  const seed = deriveKey(secret, "Happy EnCoder", ["content"]);
  const hashedSeed = new Uint8Array(createHash("sha512").update(seed).digest());
  const boxSecretKey = hashedSeed.slice(0, 32);
  const keyPair = tweetnacl.box.keyPair.fromSecretKey(boxSecretKey);
  return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
}
function encryptWithDataKey(data, dataKey) {
  const nonce = getRandomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const bundle = new Uint8Array(1 + 12 + encrypted.length + 16);
  bundle[0] = 0;
  bundle.set(nonce, 1);
  bundle.set(new Uint8Array(encrypted), 13);
  bundle.set(new Uint8Array(authTag), 13 + encrypted.length);
  return bundle;
}
function decryptWithDataKey(bundle, dataKey) {
  if (bundle.length < 1 + 12 + 16) return null;
  if (bundle[0] !== 0) return null;
  const nonce = bundle.slice(1, 13);
  const authTag = bundle.slice(bundle.length - 16);
  const ciphertext = bundle.slice(13, bundle.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}
function encryptLegacy(data, secret) {
  const nonce = getRandomBytes(tweetnacl.secretbox.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = tweetnacl.secretbox(plaintext, nonce, secret);
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}
function decryptLegacy(data, secret) {
  try {
    const nonce = data.slice(0, tweetnacl.secretbox.nonceLength);
    const encrypted = data.slice(tweetnacl.secretbox.nonceLength);
    const decrypted = tweetnacl.secretbox.open(encrypted, nonce, secret);
    if (!decrypted) return null;
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}
function encrypt(key, variant, data) {
  if (variant === "legacy") {
    return encryptLegacy(data, key);
  } else {
    return encryptWithDataKey(data, key);
  }
}
function decrypt(key, variant, data) {
  if (variant === "legacy") {
    return decryptLegacy(data, key);
  } else {
    return decryptWithDataKey(data, key);
  }
}
function libsodiumEncryptForPublicKey(data, recipientPublicKey) {
  const ephemeralKeyPair = tweetnacl.box.keyPair();
  const nonce = getRandomBytes(tweetnacl.box.nonceLength);
  const encrypted = tweetnacl.box(data, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);
  const result = new Uint8Array(32 + 24 + encrypted.length);
  result.set(ephemeralKeyPair.publicKey, 0);
  result.set(nonce, 32);
  result.set(encrypted, 56);
  return result;
}
function decryptBoxBundle(bundle, recipientSecretKey) {
  if (bundle.length < 32 + 24) return null;
  const ephemeralPublicKey = bundle.slice(0, 32);
  const nonce = bundle.slice(32, 56);
  const ciphertext = bundle.slice(56);
  const decrypted = tweetnacl.box.open(ciphertext, nonce, ephemeralPublicKey, recipientSecretKey);
  return decrypted ? new Uint8Array(decrypted) : null;
}

class LegacyCredentialsRequired extends Error {
  constructor() {
    super("Legacy credentials are required for this command. Run `happy-agent auth login` from an existing legacy install first.");
    this.name = "LegacyCredentialsRequired";
  }
}
class CredentialsNotFoundError extends Error {
  constructor() {
    super("Not authenticated. Run `happy-agent auth login` first.");
    this.name = "CredentialsNotFoundError";
  }
}
const PERSISTED_MACHINE_KEYS = /* @__PURE__ */ new Set([
  "machineId",
  "tunnelId",
  "tunnelUrl",
  "connectToken",
  "connectTokenExpiry",
  "ed25519PublicKey",
  "x25519PublicKey",
  "ed25519Fingerprint"
]);
function toPersistedMachineCredentials(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input;
  if (typeof candidate.machineId !== "string" || typeof candidate.tunnelUrl !== "string" || typeof candidate.ed25519PublicKey !== "string" || typeof candidate.x25519PublicKey !== "string") {
    return null;
  }
  if (candidate.tunnelId !== void 0 && typeof candidate.tunnelId !== "string" || candidate.connectToken !== void 0 && typeof candidate.connectToken !== "string" || candidate.connectTokenExpiry !== void 0 && typeof candidate.connectTokenExpiry !== "number" || candidate.ed25519Fingerprint !== void 0 && typeof candidate.ed25519Fingerprint !== "string") {
    return null;
  }
  const normalized = {};
  for (const key of Object.keys(candidate)) {
    if (PERSISTED_MACHINE_KEYS.has(key)) {
      normalized[key] = candidate[key];
    }
  }
  return normalized;
}
function toCredentials(persisted) {
  const adapter = { ...persisted };
  Object.defineProperties(adapter, {
    token: {
      enumerable: false,
      get() {
        if (!persisted.legacyToken) throw new LegacyCredentialsRequired();
        return persisted.legacyToken;
      }
    },
    secret: {
      enumerable: false,
      get() {
        if (!persisted.legacySecret) throw new LegacyCredentialsRequired();
        return decodeBase64(persisted.legacySecret);
      }
    },
    contentKeyPair: {
      enumerable: false,
      get() {
        if (!persisted.legacySecret) throw new LegacyCredentialsRequired();
        return deriveContentKeyPair(decodeBase64(persisted.legacySecret));
      }
    }
  });
  return adapter;
}
function loadCredentials(config) {
  if (!existsSync(config.credentialPath)) {
    throw new CredentialsNotFoundError();
  }
  const persisted = JSON.parse(readFileSync(config.credentialPath, "utf-8"));
  const sanitized = {
    ...persisted,
    machines: persisted.machines.map(toPersistedMachineCredentials).filter((m) => m !== null)
  };
  return toCredentials(sanitized);
}
async function saveCredentials(config, persisted) {
  mkdirSync(dirname(config.credentialPath), { recursive: true, mode: 448 });
  const tmpPath = `${config.credentialPath}.${process.pid}.${Date.now()}.tmp`;
  const data = `${JSON.stringify(persisted, null, 2)}
`;
  writeFileSync(tmpPath, data, { flag: "wx", mode: 384 });
  const fd = openSync(tmpPath, "r");
  try {
    fsyncBestEffort(fd);
  } finally {
    closeSync(fd);
  }
  if (process.platform !== "win32") {
    chmodSync(tmpPath, 384);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmpPath, config.credentialPath);
      break;
    } catch (error) {
      if (error.code !== "EBUSY" || attempt >= 3 || process.platform !== "win32") {
        throw error;
      }
      await setTimeout$1(50 * attempt);
    }
  }
  try {
    const dirFd = openSync(dirname(config.credentialPath), "r");
    try {
      fsyncBestEffort(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
  }
}
function fsyncBestEffort(fd) {
  try {
    fsyncSync(fd);
  } catch (error) {
    const code = error.code;
    if (process.platform !== "win32" || code !== "EINVAL" && code !== "EPERM") {
      throw error;
    }
  }
}
async function deleteCredentials(config) {
  try {
    unlinkSync(config.credentialPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
function legacyCredentialsToPersisted(token, secret) {
  return { legacyToken: token, legacySecret: encodeBase64(secret) };
}
async function updateMachineConnectToken(config, machineId, patch) {
  const credentials = loadCredentials(config);
  let found = false;
  const machines = credentials.machines.map((machine) => {
    if (machine.machineId !== machineId) {
      return machine;
    }
    found = true;
    return { ...machine, ...patch };
  });
  if (!found) {
    return false;
  }
  await saveCredentials(config, { ...credentials, machines });
  return true;
}

const API_VERSION = "2023-09-27-preview";
const DEFAULT_API_BASE_URL = "https://global.rel.tunnels.api.visualstudio.com";
function authHeaders$1(token) {
  return {
    Authorization: `github ${token}`,
    "X-Tunnel-User-Agent": "happy-agent/0.1.0"
  };
}
function responseTunnels(data) {
  const root = data;
  if (!Array.isArray(root.value)) return [];
  const tunnels = [];
  for (const item of root.value) {
    const group = item;
    if (Array.isArray(group.value)) {
      tunnels.push(...group.value.filter((entry) => typeof entry === "object" && entry !== null));
    } else if (typeof item === "object" && item !== null) {
      tunnels.push(item);
    }
  }
  return tunnels;
}
function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
function labelsFor(tunnel) {
  const raw = Array.isArray(tunnel.labels) ? tunnel.labels : Array.isArray(tunnel.tags) ? tunnel.tags : [];
  return raw.filter((label) => typeof label === "string" && label.length > 0);
}
function portUrl(tunnel) {
  const ports = Array.isArray(tunnel.ports) ? tunnel.ports : [];
  for (const port of ports) {
    if (typeof port !== "object" || port === null) continue;
    const values = port;
    const url = stringValue(values.portForwardingUri) ?? stringValue(values.webForwardingUri) ?? stringValue(values.url);
    if (url) return url;
  }
  return null;
}
function machineIdFor(tunnel, labels, tunnelId) {
  const custom = tunnel.customProperties;
  if (typeof custom === "object" && custom !== null) {
    const machineId = stringValue(custom.machineId);
    if (machineId) return machineId;
  }
  for (const label of labels) {
    if (label.startsWith("machineId:")) return label.slice("machineId:".length);
    if (label.startsWith("machineId=")) return label.slice("machineId=".length);
  }
  return tunnelId;
}
function ownerFor(tunnel) {
  const owner = tunnel.owner;
  if (typeof owner === "object" && owner !== null) {
    const login = stringValue(owner.login) ?? stringValue(owner.name) ?? stringValue(owner.id);
    if (login) return login;
  }
  return stringValue(tunnel.ownerId) ?? stringValue(tunnel.userId) ?? "";
}
function mapTunnel(tunnel) {
  const tunnelId = stringValue(tunnel.tunnelId) ?? stringValue(tunnel.id) ?? stringValue(tunnel.name);
  if (!tunnelId) throw new Error("Dev Tunnels response did not include a tunnel id");
  const labels = labelsFor(tunnel);
  return MachineTunnelSchema.parse({
    machineId: machineIdFor(tunnel, labels, tunnelId),
    tunnelId,
    url: stringValue(tunnel.tunnelUri) ?? stringValue(tunnel.webForwardingUri) ?? stringValue(tunnel.connectUrl) ?? stringValue(tunnel.url) ?? portUrl(tunnel) ?? `https://${tunnelId}.devtunnels.ms`,
    tags: labels,
    lastSeenAt: stringValue(tunnel.lastHostConnectionTime) ?? stringValue(tunnel.updatedAt) ?? Date.now(),
    owner: ownerFor(tunnel)
  });
}
class DevTunnelsClientProvider {
  credentials;
  apiBaseUrl;
  httpClient;
  interactiveLogin;
  constructor(options) {
    this.credentials = options.credentials;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.httpClient = options.httpClient ?? axios;
    this.interactiveLogin = options.loginInteractive;
  }
  async listMachineTunnels() {
    const token = await this.requireToken();
    const response = await this.httpClient.get(`${this.apiBaseUrl}/tunnels`, {
      headers: authHeaders$1(token),
      params: {
        includePorts: true,
        global: true,
        labels: "happy-machine",
        "api-version": API_VERSION
      }
    });
    return responseTunnels(response.data).map(mapTunnel);
  }
  async getConnectToken(tunnelId) {
    const token = await this.requireToken();
    const response = await this.httpClient.get(`${this.apiBaseUrl}/tunnels/${encodeURIComponent(tunnelId)}`, {
      headers: authHeaders$1(token),
      params: {
        tokenScopes: "connect",
        "api-version": API_VERSION
      }
    });
    const data = response.data;
    const connectToken = stringValue(data.accessTokens?.connect) ?? stringValue(data.accessToken);
    if (!connectToken) throw new Error(`Dev Tunnel ${tunnelId} did not return a connect token`);
    return connectToken;
  }
  async deleteTunnel(tunnelId) {
    const token = await this.requireToken();
    await this.httpClient.delete(`${this.apiBaseUrl}/tunnels/${encodeURIComponent(tunnelId)}`, {
      headers: authHeaders$1(token),
      params: { "api-version": API_VERSION }
    });
  }
  async isLoggedIn() {
    return await this.credentials.getDevTunnelsToken() !== null;
  }
  async loginInteractive() {
    if (!this.interactiveLogin) {
      throw new Error("Dev Tunnels interactive login is not configured in happy-agent yet.");
    }
    const token = await this.interactiveLogin();
    await this.credentials.setDevTunnelsToken(token);
  }
  async requireToken() {
    const token = await this.credentials.getDevTunnelsToken();
    if (!token) throw new Error("Dev Tunnels token is missing. Run interactive login first.");
    return token;
  }
}

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 30;
const TARGET_DISCOVERY_TIMEOUT_MS = 1e4;
const DEVTUNNEL_GITHUB_CLIENT_ID = "Iv1.e7b89e013f801f03";
const CONNECT_TOKEN_TTL_MS = 55 * 6e4;
const CONNECT_TOKEN_REFRESH_SKEW_MS = 6e4;
async function authLogin(config) {
  const start = await startPairing(config);
  const expiresAt = Math.floor(Date.now() / 1e3) + start.expires_in;
  console.log("## Authentication");
  console.log(`- Open: ${start.verification_uri}`);
  console.log(`- Code: ${start.user_code}`);
  let intervalSeconds = start.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;
  while (Math.floor(Date.now() / 1e3) < expiresAt) {
    await sleep(intervalSeconds * 1e3);
    let status;
    try {
      status = await postPairStatus(config.pairingBaseUrl, start.device_code);
      intervalSeconds = start.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;
    } catch (error) {
      if (isAxiosStatus(error, 429)) {
        intervalSeconds = Math.min(intervalSeconds * 2, MAX_POLL_INTERVAL_SECONDS);
        continue;
      }
      throw new Error(`Auth polling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (status.status === "pending" || status.status === "slow_down") {
      continue;
    }
    if (status.status === "expired") {
      throw new Error("Device code expired. Run 'happy-agent auth login'");
    }
    if (status.status === "authorized") {
      const devTunnelsAccess = await resolveDevTunnelsAccess(status, intervalSeconds);
      const machines = await discoverAuthorizedMachines(status, start.device_code, intervalSeconds, devTunnelsAccess);
      const legacy = readLegacyCredentials();
      const persisted = {
        githubLogin: requireString(status.githubLogin, "githubLogin"),
        devTunnelsAccess,
        deviceCode: start.device_code,
        deviceCodeExpiresAt: expiresAt,
        pairingBaseUrl: config.pairingBaseUrl,
        machines,
        discoveredMachines: status.discoveredMachines,
        ...legacy
      };
      await saveCredentials(config, persisted);
      console.log("- Status: Authenticated");
      console.log(`- GitHub: ${persisted.githubLogin}`);
      console.log(`- Machines: ${persisted.machines.length}`);
      return;
    }
  }
  throw new Error("Authentication timed out. Please try again.");
}
async function authLogout(config) {
  await deleteCredentials(config);
  console.log("## Authentication");
  console.log("- Status: Logged out");
  console.log("- Credentials: Cleared");
}
async function authStatus(config) {
  console.log("## Authentication");
  if (!existsSync(config.credentialPath)) {
    console.log("- Status: Not authenticated");
    console.log("- Action: Run `happy-agent auth login` to authenticate.");
    return;
  }
  const persisted = JSON.parse(readFileSync(config.credentialPath, "utf-8"));
  const remainingSeconds = Math.max(0, persisted.deviceCodeExpiresAt - Math.floor(Date.now() / 1e3));
  const hasLegacy = Boolean(persisted.legacyToken && persisted.legacySecret);
  console.log("- Status: Authenticated");
  console.log(`- GitHub: ${persisted.githubLogin}`);
  console.log(`- Machines: ${persisted.machines.length}`);
  console.log(`- Device Code Expires In: ${remainingSeconds}s`);
  console.log(`- Has Legacy Credentials: ${hasLegacy ? "yes" : "no"}`);
  if (!hasLegacy) {
    console.warn("Legacy credentials were not found; REST/session commands require a legacy agent.key until Sprint E migration completes.");
  }
}
async function startPairing(config) {
  try {
    const resp = await axios.get(`${config.pairingBaseUrl}/pair/start`, {
      headers: { "X-Happy-Client": "cli-control-plane/0.1.0" }
    });
    return resp.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new Error(`Failed to initiate auth: ${error.message}`);
    }
    throw error;
  }
}
async function postPairStatus(baseUrl, deviceCode, timeout, connectToken) {
  const resp = await axios.post(`${baseUrl}/pair/status`, {
    device_code: deviceCode
  }, {
    headers: {
      "X-Happy-Client": "cli-control-plane/0.1.0",
      ...connectToken ? { "X-Tunnel-Authorization": `tunnel ${connectToken}` } : {}
    },
    ...timeout ? { timeout } : {}
  });
  return resp.data;
}
function parseTunnelIdFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}
async function discoverAuthorizedMachines(status, deviceCode, intervalSeconds, devTunnelsAccess) {
  const provider = new DevTunnelsClientProvider({
    credentials: {
      getDevTunnelsToken: async () => devTunnelsAccess ?? null,
      setDevTunnelsToken: async () => void 0
    }
  });
  const machines = [];
  for (const primary of status.machines ?? []) {
    const tunnelId = primary.tunnelId ?? parseTunnelIdFromUrl(primary.tunnelUrl);
    if (!tunnelId) {
      const projected = toPersistedMachineCredentials(primary);
      if (projected) machines.push(projected);
      continue;
    }
    if (!devTunnelsAccess) {
      const projected = toPersistedMachineCredentials({ ...primary, tunnelId });
      if (projected) machines.push(projected);
      continue;
    }
    try {
      const connectToken = await provider.getConnectToken(tunnelId);
      const connectTokenExpiry = deriveConnectTokenExpiry();
      const projected = toPersistedMachineCredentials({ ...primary, tunnelId, connectToken, connectTokenExpiry });
      if (projected) machines.push(projected);
    } catch {
      const projected = toPersistedMachineCredentials({ ...primary, tunnelId });
      if (projected) machines.push(projected);
    }
  }
  for (const discovered of status.discoveredMachines ?? []) {
    if (discovered.isOnline === false) {
      console.warn(`Skipping offline tunnel: ${discovered.displayName ?? discovered.tunnelUrl}`);
      continue;
    }
    try {
      new URL(discovered.tunnelUrl);
    } catch {
      console.warn(`Skipping tunnel with invalid URL: ${discovered.displayName ?? discovered.tunnelUrl}`);
      continue;
    }
    const retryAfterMs = Math.min(intervalSeconds * 2, MAX_POLL_INTERVAL_SECONDS) * 1e3;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const connectToken = await provider.getConnectToken(discovered.tunnelId);
        const connectTokenExpiry = deriveConnectTokenExpiry();
        const target = await postPairStatus(discovered.tunnelUrl, deviceCode, TARGET_DISCOVERY_TIMEOUT_MS, connectToken);
        if (target.status === "authorized" && target.machines?.[0]) {
          const projected = toPersistedMachineCredentials({ ...target.machines[0], tunnelId: discovered.tunnelId, connectToken, connectTokenExpiry });
          if (projected) machines.push(projected);
        }
        break;
      } catch (error) {
        if (isAxiosStatus(error, 429)) {
          if (attempt === 1) {
            console.warn(`Tunnel ${discovered.tunnelUrl} rate-limited; retrying once after ${retryAfterMs}ms`);
            await sleep(retryAfterMs);
            continue;
          }
          console.warn(`Skipping rate-limited tunnel ${discovered.tunnelUrl} after retry`);
          break;
        }
        if (error instanceof AxiosError && error.response?.status) {
          console.warn(`Skipping tunnel ${discovered.tunnelUrl}: ${error.response.status}`);
        } else {
          console.warn(`Skipping unreachable tunnel ${discovered.tunnelUrl}: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
    }
  }
  return machines;
}
async function resolveDevTunnelsAccess(status, intervalSeconds) {
  if ((status.discoveredMachines ?? []).every((machine) => machine.isOnline === false)) {
    return process.env.HAPPY_DEVTUNNELS_TOKEN;
  }
  if (process.env.HAPPY_DEVTUNNELS_TOKEN) {
    return process.env.HAPPY_DEVTUNNELS_TOKEN;
  }
  if ((status.discoveredMachines ?? []).length === 0) {
    return void 0;
  }
  const start = await startDevTunnelsDeviceFlow();
  console.log("- Dev Tunnels OAuth: additional owner token required");
  console.log(`- Dev Tunnels Code: ${start.user_code}`);
  const deadline = Date.now() + start.expires_in * 1e3;
  let pollInterval = Math.max(start.interval ?? intervalSeconds, 1) * 1e3;
  while (Date.now() < deadline) {
    await sleep(pollInterval);
    const token = await pollDevTunnelsDeviceFlow(start.device_code);
    if (token) {
      return token;
    }
  }
  throw new Error("Dev Tunnels GitHub device authorization expired");
}
async function startDevTunnelsDeviceFlow() {
  const body = new URLSearchParams({ client_id: DEVTUNNEL_GITHUB_CLIENT_ID, scope: "read:user" });
  const response = await axios.post("https://github.com/login/device/code", body.toString(), {
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
  });
  return response.data;
}
async function pollDevTunnelsDeviceFlow(deviceCode) {
  const body = new URLSearchParams({
    client_id: DEVTUNNEL_GITHUB_CLIENT_ID,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code"
  });
  const response = await axios.post("https://github.com/login/oauth/access_token", body.toString(), {
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
  });
  const data = response.data;
  if (data.error === "authorization_pending" || data.error === "slow_down") return null;
  if (data.error) throw new Error(data.error);
  return data.access_token ?? null;
}
function deriveConnectTokenExpiry(now = Date.now()) {
  return now + CONNECT_TOKEN_TTL_MS;
}
function readLegacyCredentials() {
  const legacyPath = join(process.env.HAPPY_HOME_DIR ?? join(homedir(), ".happy"), "agent.key");
  if (!existsSync(legacyPath)) return {};
  const parsed = JSON.parse(readFileSync(legacyPath, "utf-8"));
  if (typeof parsed.token !== "string" || typeof parsed.secret !== "string") {
    throw new Error(`Legacy credentials file ${legacyPath} is malformed`);
  }
  const secretBytes = Buffer.from(parsed.secret, "base64");
  if (secretBytes.length !== 32 || encodeBase64(secretBytes) !== parsed.secret) {
    throw new Error(`Legacy credentials file ${legacyPath} is malformed`);
  }
  return legacyCredentialsToPersisted(parsed.token, secretBytes);
}
function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Pairing response missing ${label}`);
  }
  return value;
}
function isAxiosStatus(error, status) {
  return error instanceof AxiosError && error.response?.status === status;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const connectTokenRefreshes = /* @__PURE__ */ new Map();
function resolveRecordEncryption(record, creds, recordLabel) {
  if (record.dataEncryptionKey) {
    const encrypted = decodeBase64(record.dataEncryptionKey);
    const bundle = encrypted.slice(1);
    const sessionKey = decryptBoxBundle(bundle, creds.contentKeyPair.secretKey);
    if (!sessionKey) {
      throw new Error(`Failed to decrypt ${recordLabel} key for ${recordLabel} ${record.id}`);
    }
    return { key: sessionKey, variant: "dataKey" };
  }
  return { key: creds.secret, variant: "legacy" };
}
function resolveSessionEncryption(session, creds) {
  return resolveRecordEncryption(session, creds, "session");
}
function decryptField(encrypted, encryption) {
  if (!encrypted) return null;
  const data = decodeBase64(encrypted);
  if (encryption.variant === "dataKey") {
    return decryptWithDataKey(data, encryption.key);
  }
  return decryptLegacy(data, encryption.key);
}
function decryptSession(raw, creds) {
  const encryption = resolveSessionEncryption(raw, creds);
  return {
    id: raw.id,
    seq: raw.seq,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    active: raw.active,
    activeAt: raw.activeAt,
    metadata: decryptField(raw.metadata, encryption),
    agentState: decryptField(raw.agentState, encryption),
    dataEncryptionKey: raw.dataEncryptionKey,
    encryption
  };
}
class MachineNotKnownError extends Error {
  constructor(machineId) {
    super(`Machine ${machineId} is not known. Run 'happy-agent auth login' to refresh machine credentials.`);
    this.name = "MachineNotKnownError";
  }
}
class InvalidTunnelUrlError extends Error {
  constructor(tunnelUrl) {
    super(`Invalid tunnel URL: ${tunnelUrl}`);
    this.name = "InvalidTunnelUrlError";
  }
}
class RefreshFailedError extends Error {
  constructor(message = "Failed to refresh machine tunnel. Run 'happy-agent auth login'") {
    super(message);
    this.name = "RefreshFailedError";
  }
}
function handleApiError(err, context) {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (status === 401) {
      throw new Error("Authentication expired. Run `happy-agent auth login` to re-authenticate.");
    }
    if (status === 403) {
      throw new Error(`Forbidden: ${context}. Check your account permissions.`);
    }
    if (status === 404) {
      throw new Error(`Not found: ${context}`);
    }
    if (status && status >= 400 && status < 500) {
      const detail = err.response?.data ? `: ${JSON.stringify(err.response.data)}` : "";
      throw new Error(`Request failed (${status})${detail}`);
    }
    if (status && status >= 500) {
      throw new Error(`Server error (${status}): ${context}`);
    }
    throw new Error(`Request failed: ${err.message}`);
  }
  throw err;
}
function authHeaders(creds) {
  return {
    Authorization: `Bearer ${creds.token}`,
    "X-Happy-Client": "cli-control-plane/0.1.0"
  };
}
function discoverMachineTunnels(creds) {
  return creds.machines.map((machine) => ({
    machineId: machine.machineId,
    tunnelUrl: machine.tunnelUrl
  }));
}
function hasFreshConnectToken(machine) {
  return Boolean(machine.connectToken) && typeof machine.connectTokenExpiry === "number" && machine.connectTokenExpiry - Date.now() > CONNECT_TOKEN_REFRESH_SKEW_MS;
}
async function ensureMachineConnectToken(config, creds, machine) {
  if (hasFreshConnectToken(machine)) {
    return machine.connectToken;
  }
  const existing = connectTokenRefreshes.get(machine.machineId);
  if (existing) {
    return (await existing).connectToken;
  }
  const next = (async () => {
    if (!machine.tunnelId) {
      throw new Error(`Machine ${machine.machineId} is missing tunnelId. Run 'happy-agent auth login' to refresh credentials.`);
    }
    const provider = new DevTunnelsClientProvider({
      credentials: {
        getDevTunnelsToken: async () => creds.devTunnelsAccess ?? process.env.HAPPY_DEVTUNNELS_TOKEN ?? null,
        setDevTunnelsToken: async () => void 0
      }
    });
    const connectToken = await provider.getConnectToken(machine.tunnelId);
    const connectTokenExpiry = Date.now() + CONNECT_TOKEN_TTL_MS;
    await updateMachineConnectToken(config, machine.machineId, { connectToken, connectTokenExpiry });
    return { connectToken, connectTokenExpiry };
  })().finally(() => {
    if (connectTokenRefreshes.get(machine.machineId) === next) {
      connectTokenRefreshes.delete(machine.machineId);
    }
  });
  connectTokenRefreshes.set(machine.machineId, next);
  return (await next).connectToken;
}
async function listKnownMachines(config, creds) {
  return Promise.all(creds.machines.map(async (machine) => {
    const base = {
      id: machine.machineId,
      machineId: machine.machineId,
      tunnelUrl: machine.tunnelUrl
    };
    try {
      const connectToken = await ensureMachineConnectToken(config, creds, machine);
      const resp = await axios.get(`${machine.tunnelUrl}/v2/me/machine`, {
        headers: {
          "X-Tunnel-Authorization": `tunnel ${connectToken}`,
          "X-Happy-Client": "cli-control-plane/0.1.0"
        },
        timeout: 1e4
      });
      const state = resp.data;
      if (state.machineId !== machine.machineId) {
        return base;
      }
      return {
        ...base,
        tunnelUrl: state.tunnelUrl || machine.tunnelUrl,
        hostname: state.hostname,
        tunnelPort: state.tunnelPort,
        loopbackPort: state.loopbackPort,
        lastSeenAt: state.lastSeenAt,
        owner: state.owner
      };
    } catch {
      return base;
    }
  }));
}
async function refreshMachineTunnel(config, creds, machineId) {
  if (Math.floor(Date.now() / 1e3) >= creds.deviceCodeExpiresAt) {
    throw new RefreshFailedError("Device code expired. Run 'happy-agent auth login'");
  }
  const target = creds.machines.find((machine) => machine.machineId === machineId);
  if (!target) {
    throw new MachineNotKnownError(machineId);
  }
  try {
    new URL(target.tunnelUrl);
  } catch {
    throw new InvalidTunnelUrlError(target.tunnelUrl);
  }
  const connectToken = await ensureMachineConnectToken(config, creds, target);
  return {
    tunnelUrl: target.tunnelUrl,
    connectToken
  };
}
async function listSessions(config, creds) {
  let data;
  try {
    const resp = await axios.get(`${config.legacyServerUrl}/v1/sessions`, {
      headers: authHeaders(creds)
    });
    data = resp.data;
  } catch (err) {
    handleApiError(err, "listing sessions");
  }
  return data.sessions.map((raw) => decryptSession(raw, creds));
}
async function listActiveSessions(config, creds) {
  let data;
  try {
    const resp = await axios.get(`${config.legacyServerUrl}/v2/sessions/active`, {
      headers: authHeaders(creds)
    });
    data = resp.data;
  } catch (err) {
    handleApiError(err, "listing active sessions");
  }
  return data.sessions.map((raw) => decryptSession(raw, creds));
}
async function createSession(config, creds, opts) {
  const sessionKey = getRandomBytes(32);
  const encryptedKey = libsodiumEncryptForPublicKey(sessionKey, creds.contentKeyPair.publicKey);
  const withVersion = new Uint8Array(1 + encryptedKey.length);
  withVersion[0] = 0;
  withVersion.set(encryptedKey, 1);
  const dataEncryptionKeyBase64 = encodeBase64(withVersion);
  const encryptedMetadata = encryptWithDataKey(opts.metadata, sessionKey);
  const metadataBase64 = encodeBase64(encryptedMetadata);
  let data;
  try {
    const resp = await axios.post(
      `${config.legacyServerUrl}/v1/sessions`,
      {
        tag: opts.tag,
        metadata: metadataBase64,
        dataEncryptionKey: dataEncryptionKeyBase64
      },
      { headers: authHeaders(creds) }
    );
    data = resp.data;
  } catch (err) {
    handleApiError(err, "creating session");
  }
  const decrypted = decryptSession(data.session, creds);
  return { ...decrypted, sessionKey: decrypted.encryption.key };
}
async function getSessionMessages(config, creds, sessionId, encryption) {
  let data;
  try {
    const resp = await axios.get(
      `${config.legacyServerUrl}/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      { headers: authHeaders(creds) }
    );
    data = resp.data;
  } catch (err) {
    handleApiError(err, `session ${sessionId} messages`);
  }
  return data.messages.map((msg) => ({
    id: msg.id,
    seq: msg.seq,
    content: decryptField(msg.content.c, encryption),
    localId: msg.localId ?? null,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt
  }));
}

function waitForConnect(socket, timeoutMs = 1e4) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      reject(new Error("Timeout waiting for socket connection"));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timeout);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (error) => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}
function normalizeRpcError(error, machineId) {
  if (!error) {
    return "RPC call failed";
  }
  if (error === "RPC method not available") {
    return `Machine ${machineId} is offline or its daemon is not connected.`;
  }
  return error;
}
async function callMachineRpc(tunnelUrl, connectToken, method, params) {
  const gatewayHeaders = { "X-Tunnel-Authorization": `tunnel ${connectToken}` };
  const socket = io(tunnelUrl, {
    extraHeaders: gatewayHeaders,
    transportOptions: {
      websocket: { extraHeaders: gatewayHeaders },
      polling: { extraHeaders: gatewayHeaders }
    },
    path: "/v1/updates",
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false
  });
  socket.connect();
  try {
    await waitForConnect(socket);
    const response = await socket.timeout(3e4).emitWithAck("rpc-call", {
      method: `${params.machineId}:${method}`,
      params
    });
    if (!response.ok) {
      throw new Error(normalizeRpcError(response.error, params.machineId));
    }
    if (!response.result) {
      throw new Error("RPC call returned no result");
    }
    if (response.result == null || typeof response.result !== "object" || Array.isArray(response.result)) {
      throw new Error("RPC call returned invalid data");
    }
    if (!("type" in response.result) || response.result.type !== "success" && response.result.type !== "requestToApproveDirectoryCreation" && response.result.type !== "error") {
      throw new Error("RPC call returned unexpected data");
    }
    return response.result;
  } finally {
    socket.close();
  }
}
async function spawnSessionOnMachine(tunnelUrl, connectToken, params) {
  return callMachineRpc(tunnelUrl, connectToken, "spawn-happy-session", {
    machineId: params.machineId,
    type: "spawn-in-directory",
    directory: params.directory,
    approvedNewDirectoryCreation: params.approvedNewDirectoryCreation ?? false,
    token: params.providerToken,
    agent: params.agent
  });
}
async function spawnInWorktreeOnMachine(tunnelUrl, connectToken, params) {
  return callMachineRpc(tunnelUrl, connectToken, "spawn-in-worktree", {
    machineId: params.machineId,
    repoPath: params.repoPath,
    worktreePath: params.worktreePath,
    runId: params.runId,
    agent: params.agent,
    token: params.providerToken
  });
}
async function resumeSessionOnMachine(tunnelUrl, connectToken, params) {
  return callMachineRpc(tunnelUrl, connectToken, "resume-happy-session", params);
}

function checkIdleState(metadata, agentState) {
  const meta = metadata;
  if (meta?.lifecycleState === "archived") {
    return "archived";
  }
  const state = agentState;
  if (!state) {
    return false;
  }
  const controlledByUser = state.controlledByUser === true;
  const requests = state.requests;
  const hasRequests = requests != null && typeof requests === "object" && !Array.isArray(requests) && Object.keys(requests).length > 0;
  return !controlledByUser && !hasRequests;
}
function getTurnEvent(content) {
  if (content == null || typeof content !== "object" || Array.isArray(content)) {
    return null;
  }
  const envelope = content;
  if (envelope.role !== "session") {
    return null;
  }
  const body = envelope.content;
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  if (body.ev?.t !== "turn-start" && body.ev?.t !== "turn-end") {
    return null;
  }
  return {
    type: body.ev.t,
    turnId: typeof body.turn === "string" ? body.turn : null
  };
}
function isReadyEvent(content) {
  if (content == null || typeof content !== "object" || Array.isArray(content)) {
    return false;
  }
  const envelope = content;
  if (envelope.role !== "agent") {
    return false;
  }
  const body = envelope.content;
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  return body.type === "event" && body.data?.type === "ready";
}
class SessionClient extends EventEmitter {
  sessionId;
  encryptionKey;
  encryptionVariant;
  socket;
  metadata = null;
  metadataVersion = 0;
  agentState = null;
  agentStateVersion = 0;
  constructor(opts) {
    super();
    this.sessionId = opts.sessionId;
    this.encryptionKey = opts.encryptionKey;
    this.encryptionVariant = opts.encryptionVariant;
    if (opts.initialAgentState !== void 0) {
      this.agentState = opts.initialAgentState;
    }
    this.on("error", () => {
    });
    this.socket = io(opts.serverUrl, {
      auth: {
        token: opts.token,
        clientType: "session-scoped",
        sessionId: opts.sessionId
      },
      path: "/v1/updates",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1e3,
      reconnectionDelayMax: 5e3,
      transports: ["websocket"],
      autoConnect: false
    });
    this.socket.on("connect", () => {
      this.emit("connected");
    });
    this.socket.on("disconnect", (reason) => {
      this.emit("disconnected", reason);
    });
    this.socket.on("connect_error", (error) => {
      this.emit("connect_error", error);
    });
    this.socket.on("update", (data) => {
      try {
        const body = data?.body;
        if (!body) return;
        if (body.t === "new-message" && body.message?.content?.t === "encrypted") {
          const msg = body.message;
          const decrypted = decrypt(
            this.encryptionKey,
            this.encryptionVariant,
            decodeBase64(msg.content.c)
          );
          if (decrypted === null) return;
          this.emit("message", {
            id: msg.id,
            seq: msg.seq,
            content: decrypted,
            localId: msg.localId,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt
          });
        } else if (body.t === "update-session") {
          if (body.metadata && body.metadata.version > this.metadataVersion) {
            this.metadata = decrypt(
              this.encryptionKey,
              this.encryptionVariant,
              decodeBase64(body.metadata.value)
            );
            this.metadataVersion = body.metadata.version;
          }
          if (body.agentState && body.agentState.version > this.agentStateVersion) {
            this.agentState = body.agentState.value ? decrypt(
              this.encryptionKey,
              this.encryptionVariant,
              decodeBase64(body.agentState.value)
            ) : null;
            this.agentStateVersion = body.agentState.version;
          }
          this.emit("state-change", {
            metadata: this.metadata,
            agentState: this.agentState
          });
        }
      } catch (err) {
        this.emit("error", err);
      }
    });
    this.socket.connect();
  }
  sendMessage(text, meta) {
    const content = {
      role: "user",
      content: {
        type: "text",
        text
      },
      meta: {
        sentFrom: "happy-agent",
        ...meta
      }
    };
    const encrypted = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, content));
    this.socket.emit("message", {
      sid: this.sessionId,
      message: encrypted
    });
  }
  getMetadata() {
    return this.metadata;
  }
  getAgentState() {
    return this.agentState;
  }
  waitForConnect(timeoutMs = 1e4) {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        this.removeListener("connected", onConnect);
        this.removeListener("connect_error", onError);
        reject(new Error("Timeout waiting for socket connection"));
      }, timeoutMs);
      const onConnect = () => {
        clearTimeout(timeout);
        this.removeListener("connect_error", onError);
        resolve();
      };
      const onError = (err) => {
        clearTimeout(timeout);
        this.removeListener("connected", onConnect);
        reject(err);
      };
      this.once("connected", onConnect);
      this.once("connect_error", onError);
    });
  }
  waitForIdle(timeoutMs = 3e5) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener("state-change", onStateChange);
        this.removeListener("disconnected", onDisconnect);
      };
      const result = checkIdleState(this.metadata, this.agentState);
      if (result === "archived") {
        reject(new Error("Session is archived"));
        return;
      }
      if (result === true) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout waiting for agent to become idle"));
      }, timeoutMs);
      const onStateChange = () => {
        const r = checkIdleState(this.metadata, this.agentState);
        if (r === "archived") {
          cleanup();
          reject(new Error("Session is archived"));
        } else if (r === true) {
          cleanup();
          resolve();
        }
      };
      const onDisconnect = () => {
        cleanup();
        reject(new Error("Socket disconnected while waiting for agent to become idle"));
      };
      this.on("state-change", onStateChange);
      this.on("disconnected", onDisconnect);
    });
  }
  waitForTurnCompletion(timeoutMs = 3e5) {
    return new Promise((resolve, reject) => {
      let sawActivity = false;
      let activeTurnId = null;
      let sawTurnStart = false;
      let sawNonReadyMessage = false;
      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener("message", onMessage);
        this.removeListener("state-change", onStateChange);
        this.removeListener("disconnected", onDisconnect);
      };
      const finish = (error) => {
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const timeout = setTimeout(() => {
        finish(new Error("Timeout waiting for agent turn completion"));
      }, timeoutMs);
      const onMessage = (message) => {
        sawActivity = true;
        const turnEvent = getTurnEvent(message.content);
        if (turnEvent) {
          if (turnEvent.type === "turn-start") {
            sawTurnStart = true;
            sawNonReadyMessage = true;
            activeTurnId = turnEvent.turnId;
            return;
          }
          if (activeTurnId == null || turnEvent.turnId == null || turnEvent.turnId === activeTurnId) {
            finish();
          }
          return;
        }
        if (isReadyEvent(message.content)) {
          if (sawTurnStart || sawNonReadyMessage) {
            finish();
          }
          return;
        }
        sawNonReadyMessage = true;
      };
      const onStateChange = () => {
        if (!sawActivity || sawTurnStart) {
          return;
        }
        const result = checkIdleState(this.metadata, this.agentState);
        if (result === "archived") {
          finish(new Error("Session is archived"));
        } else if (result === true) {
          finish();
        }
      };
      const onDisconnect = () => {
        finish(new Error("Socket disconnected while waiting for agent turn completion"));
      };
      this.on("message", onMessage);
      this.on("state-change", onStateChange);
      this.on("disconnected", onDisconnect);
    });
  }
  sendStop() {
    this.socket.emit("session-end", {
      sid: this.sessionId,
      time: Date.now()
    });
  }
  close() {
    this.socket.close();
  }
}

async function appendLedgerRecord(runId, sessionId, record) {
  const parsed = LedgerRecordSchema.parse(record);
  if (parsed.runId !== runId || parsed.sessionId !== sessionId) {
    throw new Error("Ledger record identity does not match target ledger path");
  }
  const ledgerDir = join(process.env.HAPPY_PROJECT_PATH ?? process.cwd(), ".ralph", "state", runId);
  await mkdir(ledgerDir, { recursive: true });
  await appendFile(join(ledgerDir, `${sessionId}.jsonl`), `${JSON.stringify(parsed)}
`, "utf8");
}

const defaultDependencies = {
  listActiveSessions,
  getSessionMessages,
  appendLedgerRecord,
  createSessionClient: (session, creds, config) => new SessionClient({
    sessionId: session.id,
    encryptionKey: session.encryption.key,
    encryptionVariant: session.encryption.variant,
    token: creds.token,
    serverUrl: config.legacyServerUrl,
    initialAgentState: session.agentState ?? null
  }),
  now: () => (/* @__PURE__ */ new Date()).toISOString(),
  setInterval,
  clearInterval
};
const LOCKED_OUTPUT_HEURISTIC = "assistant-text";
const POLL_INTERVAL_MS = 2e3;
function getRequestIds(agentState) {
  const state = agentState;
  const requests = state?.requests;
  if (Array.isArray(requests)) {
    return requests.map((request, index) => {
      if (request != null && typeof request === "object" && typeof request.id === "string") {
        return request.id;
      }
      return String(index);
    });
  }
  if (requests != null && typeof requests === "object") {
    return Object.keys(requests);
  }
  return [];
}
function hasValidationEvidence(records) {
  return records.some((record) => record.eventType === "validation-attached" || record.eventType === "done");
}
function classifySession(metadata, agentState, ledgerRecords) {
  const meta = metadata;
  const state = agentState;
  const active = meta?.turnActive === true || state?.controlledByUser === true || getRequestIds(agentState).length > 0;
  const pendingPermission = getRequestIds(agentState).length > 0;
  const validationEvidence = hasValidationEvidence(ledgerRecords);
  return { active, pendingPermission, hasValidationEvidence: validationEvidence };
}
function asText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function extractTextPart(content) {
  if (typeof content === "string") return asText(content);
  if (content == null || typeof content !== "object") return null;
  if (Array.isArray(content)) {
    const parts = content.map(extractTextPart).filter((part) => part != null);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  const record = content;
  return asText(record.text) ?? asText(record.result) ?? asText(record.output) ?? extractTextPart(record.content);
}
function isLifecycleMessage(content) {
  if (content == null || typeof content !== "object" || Array.isArray(content)) return false;
  const record = content;
  if (record.role === "session") return true;
  const body = record.content;
  if (body == null || typeof body !== "object" || Array.isArray(body)) return false;
  if (body.type === "config" || body.type === "ready") return true;
  const data = body.data;
  return body.type === "event" && (data?.type === "ready" || data?.type === "config");
}
function summarizeLastOutput(heuristic, messages, metadata) {
  for (const message of [...messages].reverse()) {
    const content = message.content;
    if (content == null || typeof content !== "object" || Array.isArray(content)) continue;
    if (isLifecycleMessage(content)) continue;
    const record = content;
    const body = record.content;
    if (record.role === "assistant") {
      const text = extractTextPart(body);
      if (text) return text;
    }
  }
  return null;
}
function resolveProjectPath(session) {
  const meta = session.metadata;
  const fromMeta = typeof meta?.projectPath === "string" && meta.projectPath.length > 0 ? meta.projectPath : null;
  const fromEnv = typeof process.env.HAPPY_PROJECT_PATH === "string" && process.env.HAPPY_PROJECT_PATH.length > 0 ? process.env.HAPPY_PROJECT_PATH : null;
  const resolved = fromMeta ?? fromEnv;
  if (resolved == null) {
    throw new Error(
      `[monitor] Cannot resolve project path for session ${session.id}: session metadata.projectPath is unset and HAPPY_PROJECT_PATH env var is not defined. Pass --project-path or run from the project root with HAPPY_PROJECT_PATH set.`
    );
  }
  return resolved;
}
async function readSessionLedger(projectPath, runId, sessionId) {
  try {
    const text = await readFile(join(projectPath, ".ralph", "state", runId, `${sessionId}.jsonl`), "utf8");
    const records = [];
    for (const line of text.split(/\r?\n/).filter((l) => l.trim().length > 0)) {
      const result = LedgerRecordSchema.safeParse(JSON.parse(line));
      if (result.success) {
        records.push(result.data);
      } else {
        console.debug("[monitor] skipping malformed ledger line", result.error.issues);
      }
    }
    return records;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
async function appendMonitorRecords(deps, runId, snapshot, timestamp) {
  const base = { runId, sessionId: snapshot.sessionId, timestamp };
  const { active, pendingPermission, hasValidationEvidence: hasValidationEvidence2 } = snapshot.state;
  if (!active && !pendingPermission && !hasValidationEvidence2) {
    await deps.appendLedgerRecord(runId, snapshot.sessionId, { ...base, eventType: "idle-reached", queueDepth: 0 });
  }
  if (pendingPermission) {
    await deps.appendLedgerRecord(runId, snapshot.sessionId, {
      ...base,
      eventType: "pending-permission",
      requestIds: snapshot.requestIds
    });
  }
  if (snapshot.lastOutputSummary && snapshot.lastOutputHeuristic) {
    await deps.appendLedgerRecord(runId, snapshot.sessionId, {
      ...base,
      eventType: "last-output-summary",
      summary: snapshot.lastOutputSummary,
      heuristic: snapshot.lastOutputHeuristic
    });
  }
}
async function snapshotSession(config, creds, runId, session, deps = defaultDependencies) {
  const projectPath = resolveProjectPath(session);
  const ledgerRecords = await readSessionLedger(projectPath, runId, session.id);
  const messages = await deps.getSessionMessages(config, creds, session.id, session.encryption);
  const requestIds = getRequestIds(session.agentState);
  const snapshot = {
    sessionId: session.id,
    state: classifySession(session.metadata, session.agentState, ledgerRecords),
    lastOutputSummary: summarizeLastOutput(LOCKED_OUTPUT_HEURISTIC, messages, session.metadata),
    lastOutputHeuristic: LOCKED_OUTPUT_HEURISTIC,
    requestIds
  };
  await appendMonitorRecords(deps, runId, snapshot, deps.now());
  return snapshot;
}
function sessionBelongsToRun(session, runId) {
  const meta = session.metadata;
  return meta?.runId === runId;
}
async function runMonitorOnce(config, creds, runId, deps = defaultDependencies) {
  const sessions = await deps.listActiveSessions(config, creds);
  const inBatch = sessions.filter((s) => sessionBelongsToRun(s, runId));
  return Promise.all(inBatch.map((session) => snapshotSession(config, creds, runId, session, deps)));
}
async function runMonitorWatch(config, creds, runId, deps = defaultDependencies) {
  const clients = /* @__PURE__ */ new Map();
  const poll = async () => {
    const sessions = await deps.listActiveSessions(config, creds);
    const inBatch = sessions.filter((s) => sessionBelongsToRun(s, runId));
    const activeIds = new Set(inBatch.map((session) => session.id));
    for (const [sessionId, client] of clients) {
      if (!activeIds.has(sessionId)) {
        client.close();
        clients.delete(sessionId);
      }
    }
    for (const session of inBatch) {
      await snapshotSession(config, creds, runId, session, deps);
      if (clients.has(session.id)) continue;
      const client = deps.createSessionClient(session, creds, config);
      clients.set(session.id, client);
      client.on("state-change", async (data) => {
        const liveSession = { ...session, metadata: data.metadata, agentState: data.agentState };
        await snapshotSession(config, creds, runId, liveSession, deps);
      });
      client.on("disconnected", () => {
        void poll();
      });
    }
  };
  await poll();
  const timer = deps.setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
  return () => {
    deps.clearInterval(timer);
    for (const client of clients.values()) client.close();
    clients.clear();
  };
}

function formatTime(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 6e4);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
function formatIsoTime(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString();
}
function formatLastActive(ts) {
  const relative = formatTime(ts);
  const absolute = formatIsoTime(ts);
  if (absolute === "-") return relative;
  return `${relative} (${absolute})`;
}
function toMarkdownInline(value) {
  const escaped = value.replace(/`/g, "\\`");
  return `\`${escaped}\``;
}
function normalizeCodeBlockText(value) {
  const text = value.trim().length > 0 ? value : "(empty)";
  return text.replace(/```/g, "``\\`");
}
function normalizeListValue(value) {
  return value.replace(/\r?\n/g, " ").trim();
}
function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function extractSessionSummary(meta) {
  const direct = toNonEmptyString(meta.summary);
  if (direct) return direct;
  if (meta.summary != null && typeof meta.summary === "object") {
    return toNonEmptyString(meta.summary.text);
  }
  return void 0;
}
function formatSessionTable(sessions) {
  if (sessions.length === 0) {
    return "## Sessions\n\n- Total: 0\n- Items: none";
  }
  const sections = sessions.map((s, index) => {
    const meta = s.metadata ?? {};
    const name = normalizeListValue(extractSessionSummary(meta) ?? toNonEmptyString(meta.tag) ?? "-");
    const path = normalizeListValue(toNonEmptyString(meta.path) ?? "-");
    const status = s.active ? "active" : "inactive";
    const lastActive = normalizeListValue(formatLastActive(s.activeAt));
    return [
      `### Session ${index + 1}`,
      `- ID: ${toMarkdownInline(s.id)}`,
      `- Name: ${name}`,
      `- Path: ${path}`,
      `- Status: ${status}`,
      `- Last Active: ${lastActive}`
    ].join("\n");
  });
  return `## Sessions

- Total: ${sessions.length}

${sections.join("\n\n")}`;
}
function formatMachineTable(machines) {
  if (machines.length === 0) {
    return "## Machines\n\n- Total: 0\n- Items: none";
  }
  const sections = machines.map((machine, index) => {
    const hostname = normalizeListValue(toNonEmptyString(machine.hostname) ?? "-");
    const tunnelPort = typeof machine.tunnelPort === "number" ? String(machine.tunnelPort) : "-";
    const lastSeenAt = typeof machine.lastSeenAt === "number" ? formatLastActive(machine.lastSeenAt) : normalizeListValue(toNonEmptyString(machine.lastSeenAt) ?? "-");
    const owner = normalizeListValue(toNonEmptyString(machine.owner) ?? "-");
    const tunnelUrl = normalizeListValue(machine.tunnelUrl ?? "-");
    return [
      `### Machine ${index + 1}`,
      `- ID: ${toMarkdownInline(machine.id)}`,
      `- Tunnel URL: ${tunnelUrl}`,
      `- Hostname: ${hostname}`,
      `- Tunnel Port: ${tunnelPort}`,
      `- Last Seen: ${normalizeListValue(lastSeenAt)}`,
      `- Owner: ${owner}`
    ].join("\n");
  });
  return `## Machines

- Total: ${machines.length}

${sections.join("\n\n")}`;
}
function formatSessionStatus(session) {
  const meta = session.metadata ?? {};
  const state = session.agentState ?? null;
  const tag = toNonEmptyString(meta.tag);
  const summary = extractSessionSummary(meta);
  const path = toNonEmptyString(meta.path);
  const host = toNonEmptyString(meta.host);
  const lifecycleState = toNonEmptyString(meta.lifecycleState);
  const lines = [
    "## Session Status",
    "",
    `- Session ID: ${toMarkdownInline(session.id)}`
  ];
  if (tag) lines.push(`- Tag: ${tag}`);
  if (summary) lines.push(`- Summary: ${summary}`);
  if (path) lines.push(`- Path: ${path}`);
  if (host) lines.push(`- Host: ${host}`);
  if (lifecycleState) lines.push(`- Lifecycle: ${lifecycleState}`);
  lines.push(`- Active: ${session.active ? "yes" : "no"}`);
  lines.push(`- Last Active: ${formatLastActive(session.activeAt)}`);
  if (state) {
    const requests = state.requests != null && typeof state.requests === "object" ? Object.keys(state.requests).length : 0;
    const busy = state.controlledByUser === true || requests > 0;
    const agentStatus = busy ? "busy" : "idle";
    lines.push(`- Agent: ${agentStatus}`);
    if (requests > 0) {
      lines.push(`- Pending Requests: ${requests}`);
    }
  } else {
    lines.push("- Agent: no state");
  }
  return lines.join("\n");
}
function formatMessageHistory(messages) {
  if (messages.length === 0) {
    return "## Message History\n\n- Count: 0\n- Items: none";
  }
  const sections = messages.map((msg, index) => {
    const content = msg.content;
    const role = content?.role ?? "unknown";
    const timestamp = formatIsoTime(msg.createdAt);
    let text;
    if (content?.content && typeof content.content === "object" && content.content.text) {
      text = String(content.content.text);
    } else if (content?.content && typeof content.content === "string") {
      text = content.content;
    } else {
      text = JSON.stringify(content);
    }
    return [
      `### Message ${index + 1}`,
      `- ID: ${toMarkdownInline(msg.id)}`,
      `- Time: ${timestamp}`,
      `- Role: ${role}`,
      "- Text:",
      "```text",
      normalizeCodeBlockText(text),
      "```"
    ].join("\n");
  });
  return `## Message History

- Count: ${messages.length}

${sections.join("\n\n")}`;
}
function formatJson(data) {
  return JSON.stringify(data, (key, value) => {
    if (key === "encryption" || key === "dataEncryptionKey") return void 0;
    if (value instanceof Uint8Array) {
      return Buffer.from(value).toString("base64");
    }
    return value;
  }, 2);
}

const SUPPORTED_AGENTS = ["claude", "codex", "gemini", "openclaw"];
function resolveByPrefix(items, value, label) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const matches = items.filter((item) => item.id.startsWith(value));
  if (matches.length === 0) {
    throw new Error(`No ${label.toLowerCase()} found matching "${value}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous ${label.toLowerCase()} "${value}" matches ${matches.length} records. Be more specific.`);
  }
  return matches[0];
}
async function resolveSession(config, creds, sessionId) {
  const sessions = await listSessions(config, creds);
  return resolveByPrefix(sessions, sessionId, "Session ID");
}
async function resolveMachine(config, creds, machineId) {
  const machines = await listKnownMachines(config, creds);
  return resolveByPrefix(machines, machineId, "Machine ID");
}
function createClient(session, creds, config) {
  return new SessionClient({
    sessionId: session.id,
    encryptionKey: session.encryption.key,
    encryptionVariant: session.encryption.variant,
    token: creds.token,
    serverUrl: config.legacyServerUrl,
    initialAgentState: session.agentState ?? null
  });
}
function resolveRemotePath(rawPath) {
  if (!rawPath || rawPath.trim().length === 0) {
    throw new Error("Pass --path explicitly - machine homeDir is no longer auto-discovered.");
  }
  return rawPath;
}
function resolveSessionMachineId(session) {
  const metadata = session.metadata ?? {};
  if (typeof metadata.machineId !== "string" || metadata.machineId.trim().length === 0) {
    throw new Error(`Session ${session.id} is missing machine metadata and cannot be resumed.`);
  }
  return metadata.machineId;
}
async function resolveKnownMachineTunnel(config, creds, machineId) {
  const tunnels = discoverMachineTunnels(creds);
  if (!tunnels.find((tunnel) => tunnel.machineId === machineId)) {
    throw new MachineNotKnownError(machineId);
  }
  return refreshMachineTunnel(config, creds, machineId);
}
const program = new Command();
program.name("happy-agent").description("CLI client for controlling Happy Coder agents remotely").version("0.1.0");
program.command("auth").description("Manage authentication").addCommand(
  new Command("login").description("Authenticate via GitHub device flow").action(async () => {
    const config = loadConfig();
    await authLogin(config);
  })
).addCommand(
  new Command("logout").description("Clear stored credentials").action(async () => {
    const config = loadConfig();
    await authLogout(config);
  })
).addCommand(
  new Command("status").description("Show authentication status").action(async () => {
    const config = loadConfig();
    await authStatus(config);
  })
);
program.command("machines").description("List all machines").option("--json", "Output as JSON").action(async (opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const machines = await listKnownMachines(config, creds);
  if (opts.json) {
    console.log(formatJson(machines));
  } else {
    console.log(formatMachineTable(machines));
  }
});
program.command("list").description("List all sessions").option("--active", "Show only active sessions").option("--json", "Output as JSON").action(async (opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const sessions = opts.active ? await listActiveSessions(config, creds) : await listSessions(config, creds);
  if (opts.json) {
    console.log(formatJson(sessions));
  } else {
    console.log(formatSessionTable(sessions));
  }
});
program.command("monitor").description("Monitor active sessions for a fan-out run").requiredOption("--runId <id>", "Fan-out run ID").option("--watch", "Keep polling and subscribing to active sessions").option("--json", "Output as JSON").action(async (opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  if (opts.watch) {
    const teardown = await runMonitorWatch(config, creds, opts.runId);
    console.log(`Monitoring run ${opts.runId}. Press Ctrl+C to stop.`);
    process.once("SIGINT", () => {
      teardown();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      teardown();
      process.exit(0);
    });
    return;
  }
  const snapshots = await runMonitorOnce(config, creds, opts.runId);
  if (opts.json) {
    console.log(formatJson({ runId: opts.runId, sessions: snapshots }));
    return;
  }
  console.log([
    "## Monitor Snapshot",
    "",
    `- Run ID: ${opts.runId}`,
    `- Sessions: ${snapshots.length}`,
    "",
    ...snapshots.map((snapshot) => [
      `### ${snapshot.sessionId}`,
      `- Active: ${snapshot.state.active}, Pending Permission: ${snapshot.state.pendingPermission}, Validation Evidence: ${snapshot.state.hasValidationEvidence}`,
      `- Pending Requests: ${snapshot.requestIds.length}`,
      `- Last Output: ${snapshot.lastOutputSummary ?? "-"}`
    ].join("\n"))
  ].join("\n"));
});
program.command("status").description("Get live session state").arguments("<session-id>").option("--json", "Output as JSON").action(async (sessionId, opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  const client = createClient(session, creds, config);
  let liveData = false;
  try {
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        client.removeAllListeners("state-change");
        client.removeAllListeners("connect_error");
        resolve();
      };
      const timeout = setTimeout(done, 3e3);
      client.once("state-change", (data) => {
        session.metadata = data.metadata ?? session.metadata;
        session.agentState = data.agentState ?? session.agentState;
        liveData = true;
        done();
      });
      client.once("connect_error", () => {
        done();
      });
    });
  } finally {
    client.close();
  }
  if (opts.json) {
    console.log(formatJson(session));
  } else {
    if (!liveData) {
      console.log("> Note: showing cached data (could not get live status).");
    }
    console.log(formatSessionStatus(session));
  }
});
program.command("spawn").description("Spawn a new session on a machine").requiredOption("--machine <machine-id>", "Machine ID or prefix").option("--path <path>", "Legacy working directory path (defaults to machine home directory)").option("--new-worktree", "Create a git worktree through the daemon before spawning").option("--repo <path>", "Repository root for --new-worktree").option("--worktree <path>", "Optional explicit worktree path for --new-worktree").option("--agent <agent>", `Agent to start (${SUPPORTED_AGENTS.join(", ")})`, (value) => {
  if (!SUPPORTED_AGENTS.includes(value)) {
    throw new Error(`--agent must be one of: ${SUPPORTED_AGENTS.join(", ")}`);
  }
  return value;
}).option("--run-id <id>", "Batch run ID to group concurrent spawns under a single rendered region").option("--create-dir", "Allow creating the directory if it does not exist").option("--json", "Output as JSON").action(async (opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const machine = await resolveMachine(config, creds, opts.machine);
  if (opts.newWorktree) {
    if (!opts.repo) {
      throw new Error("--repo is required with --new-worktree");
    }
    if (!opts.agent) {
      throw new Error("--agent is required with --new-worktree");
    }
    if (opts.path) {
      throw new Error("--path is the legacy spawn path and cannot be used with --new-worktree. Use --repo and optional --worktree.");
    }
    if (opts.createDir) {
      throw new Error("--create-dir is only supported by the legacy --path flow.");
    }
    const { tunnelUrl: tunnelUrl2, connectToken: connectToken2 } = await resolveKnownMachineTunnel(config, creds, machine.id);
    const result2 = await spawnInWorktreeOnMachine(tunnelUrl2, connectToken2, {
      machineId: machine.id,
      repoPath: opts.repo,
      worktreePath: opts.worktree,
      runId: opts.runId,
      agent: opts.agent
    });
    const payload2 = {
      machineId: machine.id,
      repoPath: opts.repo,
      requestedWorktreePath: opts.worktree ?? null,
      agent: opts.agent,
      ...result2
    };
    if (opts.json) {
      console.log(formatJson(payload2));
      if (result2.type !== "success") {
        process.exitCode = 1;
      }
      return;
    }
    switch (result2.type) {
      case "success":
        console.log([
          "## Session Spawned",
          "",
          `- Machine ID: \`${machine.id}\``,
          `- Session ID: \`${result2.sessionId}\``,
          `- Project Path: ${opts.repo}`,
          `- Worktree Path: ${result2.worktreePath ?? opts.worktree ?? "(daemon did not return worktree path)"}`,
          `- Branch: ${result2.branchName ?? "(daemon did not return branch name)"}`,
          `- Run ID: ${result2.runId ?? "(daemon did not return run ID)"}`,
          `- Agent: ${opts.agent}`
        ].join("\n"));
        break;
      case "requestToApproveDirectoryCreation":
        throw new Error(`Spawn-in-worktree unexpectedly requested directory creation for '${result2.directory}'.`);
      case "error":
        throw new Error(result2.errorMessage);
    }
    return;
  }
  if (opts.repo || opts.worktree) {
    throw new Error("--repo and --worktree require --new-worktree");
  }
  const directory = resolveRemotePath(opts.path);
  const { tunnelUrl, connectToken } = await resolveKnownMachineTunnel(config, creds, machine.id);
  const result = await spawnSessionOnMachine(tunnelUrl, connectToken, {
    machineId: machine.id,
    directory,
    approvedNewDirectoryCreation: opts.createDir,
    agent: opts.agent
  });
  const payload = {
    machineId: machine.id,
    directory,
    agent: opts.agent ?? null,
    ...result
  };
  if (opts.json) {
    console.log(formatJson(payload));
    if (result.type !== "success") {
      process.exitCode = 1;
    }
    return;
  }
  switch (result.type) {
    case "success":
      console.log([
        "## Session Spawned",
        "",
        `- Machine ID: \`${machine.id}\``,
        `- Session ID: \`${result.sessionId}\``,
        `- Path: ${directory}`,
        `- Agent: ${opts.agent ?? "default"}`
      ].join("\n"));
      break;
    case "requestToApproveDirectoryCreation":
      throw new Error(`The directory '${result.directory}' does not exist. Re-run with --create-dir to allow creating it.`);
    case "error":
      throw new Error(result.errorMessage);
  }
});
program.command("resume").description("Resume a session on its original machine").arguments("<session-id>").option("--json", "Output as JSON").action(async (sessionId, opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  const machineId = resolveSessionMachineId(session);
  const machine = await resolveMachine(config, creds, machineId);
  const { tunnelUrl, connectToken } = await resolveKnownMachineTunnel(config, creds, machine.id);
  const result = await resumeSessionOnMachine(tunnelUrl, connectToken, { machineId: machine.id, sessionId: session.id });
  const payload = {
    sourceSessionId: session.id,
    machineId: machine.id,
    ...result
  };
  if (opts.json) {
    console.log(formatJson(payload));
    if (result.type !== "success") {
      process.exitCode = 1;
    }
    return;
  }
  switch (result.type) {
    case "success":
      console.log([
        "## Session Resumed",
        "",
        `- Machine ID: \`${machine.id}\``,
        `- Source Session ID: \`${session.id}\``,
        `- Resumed Session ID: \`${result.sessionId}\``
      ].join("\n"));
      break;
    case "requestToApproveDirectoryCreation":
      throw new Error(`Resume unexpectedly requested directory creation for '${result.directory}'. Resume should reuse the saved path.`);
    case "error":
      throw new Error(result.errorMessage);
  }
});
program.command("create").description("Create a new session").requiredOption("--tag <tag>", "Session tag").option("--path <path>", "Working directory path").option("--json", "Output as JSON").action(async (opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const metadata = {
    tag: opts.tag,
    path: opts.path ?? process.cwd(),
    host: hostname()
  };
  const session = await createSession(config, creds, {
    tag: opts.tag,
    metadata
  });
  if (opts.json) {
    console.log(formatJson(session));
  } else {
    console.log([
      "## Session Created",
      "",
      `- Session ID: \`${session.id}\``
    ].join("\n"));
  }
});
program.command("send").description("Send a message to a session").arguments("<session-id> <message>").option("--yolo", "Send with permissionMode=yolo").option("--wait", "Wait for agent to become idle").option("--json", "Output as JSON").action(async (sessionId, message, opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  const permissionMode = opts.yolo ? "yolo" : null;
  const client = createClient(session, creds, config);
  try {
    await client.waitForConnect();
    const completion = opts.wait ? client.waitForTurnCompletion() : null;
    client.sendMessage(message, permissionMode ? { permissionMode } : void 0);
    if (completion) {
      await completion;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    client.close();
  }
  if (opts.json) {
    console.log(formatJson({ sessionId: session.id, message, sent: true, permissionMode }));
  } else {
    console.log([
      "## Message Sent",
      "",
      `- Session ID: \`${session.id}\``,
      `- Permission Mode: ${permissionMode ?? "default"}`,
      `- Waited For Idle: ${opts.wait ? "yes" : "no"}`
    ].join("\n"));
  }
});
program.command("history").description("Read message history").arguments("<session-id>").option("--limit <n>", "Limit number of messages", (v) => {
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) throw new Error("--limit must be a positive integer");
  return n;
}).option("--json", "Output as JSON").action(async (sessionId, opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  let messages = await getSessionMessages(config, creds, session.id, session.encryption);
  messages.sort((a, b) => a.createdAt - b.createdAt);
  if (opts.limit && opts.limit > 0) {
    messages = messages.slice(-opts.limit);
  }
  if (opts.json) {
    console.log(formatJson(messages));
  } else {
    console.log(formatMessageHistory(messages));
  }
});
program.command("stop").description("Stop a session").arguments("<session-id>").action(async (sessionId) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  const client = createClient(session, creds, config);
  try {
    await client.waitForConnect();
    client.sendStop();
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    client.close();
  }
  console.log([
    "## Session Stopped",
    "",
    `- Session ID: \`${session.id}\``
  ].join("\n"));
});
program.command("wait").description("Wait for agent to become idle").arguments("<session-id>").option("--timeout <seconds>", "Timeout in seconds", (v) => {
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) throw new Error("--timeout must be a positive integer");
  return n;
}, 300).action(async (sessionId, opts) => {
  const config = loadConfig();
  const creds = loadCredentials(config);
  const session = await resolveSession(config, creds, sessionId);
  const client = createClient(session, creds, config);
  try {
    await client.waitForConnect();
    await client.waitForIdle(opts.timeout * 1e3);
    console.log([
      "## Session Idle",
      "",
      `- Session ID: \`${session.id}\``
    ].join("\n"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exitCode = 1;
  } finally {
    client.close();
  }
});
program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

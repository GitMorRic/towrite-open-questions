import { requestHub } from "./http";

/**
 * Account and first-run provisioning client for Device Hub.
 *
 * The instance is deliberately bound to one validated origin. Account access
 * tokens are accepted per operation rather than retained, so callers can keep
 * their short-lived login state separate from the long-lived receiver token.
 */

export interface HubAdminClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface HubEmailChallenge {
  challengeId: string;
  expiresAt: string;
  delivery?: string;
  /** Present only when the local development mailer explicitly returns it. */
  developmentCode?: string;
}

export interface HubAccountAccess {
  /** Short-lived account credential. Never persisted by HubAdminClient. */
  accessToken: string;
  tokenType: "bearer";
}

export interface HubPersonalProvisionRequest {
  receiverPublicKey: JsonWebKey;
  receiverName?: string;
  deviceName?: string;
}

export interface HubPersonalProvisionResult {
  receiverId: string;
  /** Long-lived Connector credential. Store it locally and never put it in a URL. */
  pullToken: string;
  deviceId: string;
  /** Returned once after device creation. It belongs on the physical device. */
  deviceSecret: string;
  tapId: string;
  tapUrl: string;
}

export interface HubDeviceSecretRotation {
  deviceId: string;
  /** Returned once. The previous device secret becomes invalid immediately. */
  deviceSecret: string;
}

export interface HubTapRotation {
  deviceId: string;
  tapId: string;
  tapUrl: string;
}

/** A sanitized error that is safe to display in Obsidian settings. */
export class HubAdminError extends Error {
  constructor(
    readonly operation: string,
    readonly status?: number
  ) {
    super(status
      ? `Device Hub could not ${operation} (HTTP ${status}).`
      : `Device Hub could not ${operation}.`);
    this.name = "HubAdminError";
  }
}

export class HubAdminClient {
  readonly baseUrl: string;
  private readonly fetcher?: typeof fetch;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, options: HubAdminClientOptions = {}) {
    this.baseUrl = normalizeAdminBaseUrl(baseUrl);
    this.fetcher = options.fetch;
    this.timeoutMs = Math.max(250, Math.min(120_000, options.timeoutMs ?? 10_000));
  }

  async startEmailAuth(email: string): Promise<HubEmailChallenge> {
    const normalizedEmail = normalizeEmail(email);
    const response = asRecord(await this.requestJson(
      "/v1/auth/email/start",
      "start email sign-in",
      { method: "POST", body: { email: normalizedEmail } }
    ), "email challenge");
    return {
      challengeId: requiredString(response, "challenge_id", "challengeId"),
      expiresAt: requiredString(response, "expires_at", "expiresAt"),
      delivery: optionalString(response, "delivery"),
      developmentCode: optionalString(response, "debug_code", "dev_code", "developmentCode")
    };
  }

  async verifyEmailAuth(email: string, challengeId: string, code: string): Promise<HubAccountAccess> {
    const normalizedEmail = normalizeEmail(email);
    const safeChallengeId = safeIdentifier(challengeId, "challenge ID");
    const safeCode = code.trim();
    if (!safeCode || safeCode.length > 32 || CONTROL_CHARACTER.test(safeCode)) {
      throw new Error("Device Hub verification code is invalid.");
    }
    const response = asRecord(await this.requestJson(
      "/v1/auth/email/verify",
      "verify email sign-in",
      {
        method: "POST",
        body: {
          email: normalizedEmail,
          challenge_id: safeChallengeId,
          code: safeCode
        }
      }
    ), "account access response");
    return {
      accessToken: secretString(response, "access_token", "accessToken"),
      tokenType: "bearer"
    };
  }

  /**
   * Provisions one personal e-ink endpoint and binds it to a new Connector.
   * The promise resolves only after every step, including tap rotation, succeeds.
   */
  async provisionPersonalHub(
    accountAccessToken: string,
    request: HubPersonalProvisionRequest
  ): Promise<HubPersonalProvisionResult> {
    const token = normalizeAccessToken(accountAccessToken);
    const publicKey = normalizePublicP256Jwk(request.receiverPublicKey);

    const receiver = asRecord(await this.requestJson(
      "/v1/receivers",
      "create the Obsidian receiver",
      {
        method: "POST",
        body: {
          name: normalizeName(request.receiverName, "ToWrite Obsidian Connector"),
          public_key: JSON.stringify(publicKey)
        }
      },
      token
    ), "receiver response");
    const receiverId = safeIdentifier(requiredString(receiver, "receiver_id", "receiverId"), "receiver ID");
    const pullToken = secretString(receiver, "pull_token", "pullToken");

    const device = asRecord(await this.requestJson(
      "/v1/devices",
      "create the e-ink device",
      {
        method: "POST",
        body: {
          name: normalizeName(request.deviceName, "ToWrite E-ink Display"),
          kind: "eink"
        }
      },
      token
    ), "device response");
    const deviceId = safeIdentifier(requiredString(device, "device_id", "deviceId"), "device ID");
    const deviceSecret = secretString(device, "device_secret", "deviceSecret");

    const pairing = asRecord(await this.requestJson(
      "/v1/pairing/sessions",
      "create the pairing session",
      { method: "POST", body: { receiver_id: receiverId } },
      token
    ), "pairing response");
    const pairingCode = secretString(pairing, "code");

    const claim = asRecord(await this.requestJson(
      "/v1/pairing/claim",
      "bind the receiver and device",
      {
        method: "POST",
        body: { code: pairingCode, device_id: deviceId }
      },
      token
    ), "pairing claim response");
    if (claim.paired !== true
      || requiredString(claim, "receiver_id", "receiverId") !== receiverId
      || requiredString(claim, "device_id", "deviceId") !== deviceId) {
      throw new HubAdminError("verify the receiver/device binding");
    }

    const tap = await this.rotateTapId(token, deviceId);
    return {
      receiverId,
      pullToken,
      deviceId,
      deviceSecret,
      tapId: tap.tapId,
      tapUrl: tap.tapUrl
    };
  }

  async rotateDeviceSecret(accountAccessToken: string, deviceId: string): Promise<HubDeviceSecretRotation> {
    const token = normalizeAccessToken(accountAccessToken);
    const id = safeIdentifier(deviceId, "device ID");
    const response = asRecord(await this.requestJson(
      `/v1/hub/devices/${encodeURIComponent(id)}/secret/rotate`,
      "rotate the device secret",
      { method: "POST" },
      token
    ), "device secret rotation response");
    const returnedId = requiredString(response, "device_id", "deviceId");
    if (returnedId !== id) {
      throw new HubAdminError("verify the rotated device secret");
    }
    return {
      deviceId: returnedId,
      deviceSecret: secretString(response, "device_secret", "deviceSecret")
    };
  }

  async rotateTapId(accountAccessToken: string, deviceId: string): Promise<HubTapRotation> {
    const token = normalizeAccessToken(accountAccessToken);
    const id = safeIdentifier(deviceId, "device ID");
    const response = asRecord(await this.requestJson(
      `/v1/hub/devices/${encodeURIComponent(id)}/tap-id/rotate`,
      "rotate the NFC tap address",
      { method: "POST" },
      token
    ), "tap rotation response");
    return {
      deviceId: id,
      tapId: requiredString(response, "tap_id", "tapId"),
      tapUrl: normalizeTapUrl(requiredString(response, "url", "tap_url", "tapUrl"))
    };
  }

  private async requestJson(
    path: string,
    operation: string,
    request: { method: "GET" | "POST"; body?: Record<string, unknown> },
    accountAccessToken?: string
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (request.body) {
        headers["content-type"] = "application/json";
      }
      if (accountAccessToken) {
        headers.authorization = `Bearer ${accountAccessToken}`;
      }
      const response = await requestHub(`${this.baseUrl}${path}`, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store"
      }, this.fetcher);
      if (!response.ok) {
        throw new HubAdminError(operation, response.status);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new HubAdminError(operation, response.status);
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof HubAdminError) {
        throw error;
      }
      // Network/runtime errors can contain request internals on some fetch
      // implementations. Replace them with a stable, display-safe message.
      throw new HubAdminError(operation);
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function normalizeAdminBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Device Hub URL must be a valid HTTPS origin.");
  }
  const localDevelopment = isLocalHostname(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDevelopment)) {
    throw new Error("Device Hub URL must use HTTPS (HTTP is allowed only for localhost development).");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Device Hub URL must not contain credentials, query parameters, or a fragment.");
  }
  if (parsed.pathname !== "/") {
    throw new Error("Device Hub URL must be an origin without an API path.");
  }
  return parsed.origin;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "[::1]";
}

function normalizeTapUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HubAdminError("verify the NFC tap address");
  }
  const localDevelopment = isLocalHostname(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDevelopment))
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^\/t\/v1\/tap_[A-Za-z0-9_-]+$/u.test(parsed.pathname)) {
    throw new HubAdminError("verify the NFC tap address");
  }
  return parsed.toString();
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || CONTROL_CHARACTER.test(email)
    || !/^[^\s@]+@[^\s@]+$/u.test(email)) {
    throw new Error("Device Hub email address is invalid.");
  }
  return email;
}

function normalizeName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() || fallback;
  if (normalized.length > 120 || CONTROL_CHARACTER.test(normalized)) {
    throw new Error("Device Hub display name is invalid.");
  }
  return normalized;
}

function normalizeAccessToken(value: string): string {
  const token = value.trim();
  if (!token || token.length > 16_384 || CONTROL_CHARACTER.test(token)) {
    throw new Error("Device Hub account access token is invalid.");
  }
  return token;
}

function normalizePublicP256Jwk(value: JsonWebKey): JsonWebKey {
  if (!value || value.kty !== "EC" || value.crv !== "P-256"
    || typeof value.x !== "string" || !value.x
    || typeof value.y !== "string" || !value.y
    || typeof value.d === "string") {
    throw new Error("Device Hub receiver key must be a public P-256 JWK.");
  }
  // Only transmit the fields required to encrypt captures. This also avoids
  // forwarding application metadata or an accidentally enumerable extension.
  return {
    kty: "EC",
    crv: "P-256",
    x: value.x,
    y: value.y,
    ext: true,
    key_ops: []
  };
}

function safeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || CONTROL_CHARACTER.test(normalized)) {
    throw new Error(`Device Hub ${label} is invalid.`);
  }
  return normalized;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HubAdminError(`read the ${label}`);
  }
  return value as Record<string, unknown>;
}

function optionalString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function requiredString(record: Record<string, unknown>, ...keys: string[]): string {
  const value = optionalString(record, ...keys);
  if (!value || CONTROL_CHARACTER.test(value)) {
    throw new HubAdminError(`read ${keys[0]} from the response`);
  }
  return value;
}

function secretString(record: Record<string, unknown>, ...keys: string[]): string {
  const value = requiredString(record, ...keys);
  if (value.length > 16_384) {
    throw new HubAdminError(`read ${keys[0]} from the response`);
  }
  return value;
}

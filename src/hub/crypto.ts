import type { HubCaptureEncryptionEnvelope, HubCapturePlaintext } from "./types";

const ENVELOPE_ALGORITHM = "ECDH-P256+HKDF-SHA256+A256GCM" as const;
const HKDF_INFO = new TextEncoder().encode("towrite-hub-capture-v1");
const MAX_CIPHERTEXT_BYTES = 1_048_576;

export interface HubCaptureKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface CaptureCryptoOptions {
  crypto?: Crypto;
  additionalData?: string;
}

export async function generateHubCaptureKeyPair(crypto: Crypto = requireCrypto()): Promise<HubCaptureKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const keyPair = pair as CryptoKeyPair;
  return {
    publicKey: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", keyPair.privateKey)
  };
}

export async function encryptHubCapture(
  payload: HubCapturePlaintext,
  recipientPublicKey: JsonWebKey | CryptoKey,
  options: CaptureCryptoOptions = {}
): Promise<HubCaptureEncryptionEnvelope> {
  const crypto = options.crypto ?? requireCrypto();
  const publicKey = isCryptoKey(recipientPublicKey)
    ? recipientPublicKey
    : await importEcdhPublicKey(recipientPublicKey, crypto);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"] as KeyUsage[]) as CryptoKeyPair;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(options.additionalData ?? "towrite-hub-capture-v1");
  const aesKey = await deriveAesKey(ephemeral.privateKey, publicKey, salt, crypto, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: copyToArrayBuffer(iv),
    additionalData: copyToArrayBuffer(additionalData),
    tagLength: 128
  }, aesKey, copyToArrayBuffer(plaintext)));
  return {
    version: 1,
    algorithm: ENVELOPE_ALGORITHM,
    ephemeralPublicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(ciphertext),
    additionalData: encodeBase64Url(additionalData)
  };
}

export async function decryptHubCapture<T extends HubCapturePlaintext = HubCapturePlaintext>(
  envelope: HubCaptureEncryptionEnvelope,
  recipientPrivateKey: JsonWebKey | CryptoKey,
  options: Pick<CaptureCryptoOptions, "crypto"> = {}
): Promise<T> {
  const crypto = options.crypto ?? requireCrypto();
  validateEnvelope(envelope);
  const privateKey = isCryptoKey(recipientPrivateKey)
    ? recipientPrivateKey
    : await importEcdhPrivateKey(recipientPrivateKey, crypto);
  const publicKey = await importEcdhPublicKey(envelope.ephemeralPublicKey, crypto);
  const salt = decodeBase64Url(envelope.salt);
  const iv = decodeBase64Url(envelope.iv);
  const ciphertext = decodeBase64Url(envelope.ciphertext);
  const additionalData = envelope.additionalData
    ? decodeBase64Url(envelope.additionalData)
    : new TextEncoder().encode("towrite-hub-capture-v1");
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16 || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error("Invalid Device Hub capture envelope lengths.");
  }
  const aesKey = await deriveAesKey(privateKey, publicKey, salt, crypto, ["decrypt"]);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: copyToArrayBuffer(iv),
      additionalData: copyToArrayBuffer(additionalData),
      tagLength: 128
    }, aesKey, copyToArrayBuffer(ciphertext));
  } catch {
    throw new Error("Device Hub capture authentication failed.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown;
  } catch {
    throw new Error("Device Hub capture plaintext is not valid UTF-8 JSON.");
  }
  validatePlaintext(parsed);
  return parsed as T;
}

async function deriveAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Uint8Array,
  crypto: Crypto,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt: copyToArrayBuffer(salt),
    info: copyToArrayBuffer(HKDF_INFO)
  }, hkdfKey, { name: "AES-GCM", length: 256 }, false, usages);
}

function importEcdhPublicKey(jwk: JsonWebKey, crypto: Crypto): Promise<CryptoKey> {
  assertP256Jwk(jwk, false);
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

function importEcdhPrivateKey(jwk: JsonWebKey, crypto: Crypto): Promise<CryptoKey> {
  assertP256Jwk(jwk, true);
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

function assertP256Jwk(jwk: JsonWebKey, requirePrivate: boolean): void {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || (requirePrivate && !jwk.d)) {
    throw new Error("Device Hub capture key must be a P-256 EC JWK.");
  }
}

function validateEnvelope(value: HubCaptureEncryptionEnvelope): void {
  if (!value || value.version !== 1 || value.algorithm !== ENVELOPE_ALGORITHM) {
    throw new Error("Unsupported Device Hub capture encryption envelope.");
  }
  if (!value.salt || !value.iv || !value.ciphertext || !value.ephemeralPublicKey) {
    throw new Error("Incomplete Device Hub capture encryption envelope.");
  }
}

function validatePlaintext(value: unknown): asserts value is HubCapturePlaintext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Device Hub capture plaintext.");
  }
  const record = value as Record<string, unknown>;
  const required = ["captureId", "selectionId", "contentId", "intent", "body", "createdAt"];
  if (record.protocolVersion !== "1" || required.some((key) => typeof record[key] !== "string")) {
    throw new Error("Invalid Device Hub capture plaintext contract.");
  }
  if (!(["respond", "capture", "open"] as unknown[]).includes(record.intent)) {
    throw new Error("Invalid Device Hub capture intent.");
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url in Device Hub capture envelope.");
  }
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Invalid base64url in Device Hub capture envelope.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isCryptoKey(value: JsonWebKey | CryptoKey): value is CryptoKey {
  return Boolean(value)
    && typeof value === "object"
    && "algorithm" in value
    && "type" in value
    && "usages" in value;
}

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable; encrypted Device Hub captures cannot be processed.");
  }
  return globalThis.crypto;
}

export { ENVELOPE_ALGORITHM };

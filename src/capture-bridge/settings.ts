import { generateCaptureBridgeToken, generateCaptureTapId, isCaptureTapId } from "./ids";
import type { CaptureBridgeSettings } from "./types";

export const CAPTURE_BRIDGE_PORT = 48322;

export const DEFAULT_CAPTURE_BRIDGE_SETTINGS: CaptureBridgeSettings = {
  enabled: false,
  flow: "local_capture",
  bindHost: "127.0.0.1",
  port: CAPTURE_BRIDGE_PORT,
  callbackToken: "",
  captureBaseUrl: "",
  tapId: "",
  ownerLogin: "",
  handoffTtlSeconds: 300,
  lastRegisteredAt: "",
  lastError: ""
};

export function normalizeCaptureBridgeSettings(
  settings?: Partial<CaptureBridgeSettings>
): CaptureBridgeSettings {
  const callbackToken = String(settings?.callbackToken ?? "").trim();
  const tapId = String(settings?.tapId ?? "").trim();
  return {
    enabled: settings?.enabled === true,
    flow: settings?.flow === "hub_e2ee" ? "hub_e2ee" : "local_capture",
    bindHost: "127.0.0.1",
    port: CAPTURE_BRIDGE_PORT,
    callbackToken: /^[A-Za-z0-9_-]{43}$/u.test(callbackToken) ? callbackToken : generateCaptureBridgeToken(),
    captureBaseUrl: normalizeCaptureBridgeBaseUrl(settings?.captureBaseUrl),
    tapId: isCaptureTapId(tapId) ? tapId : generateCaptureTapId(),
    ownerLogin: String(settings?.ownerLogin ?? "").trim().slice(0, 200),
    handoffTtlSeconds: clampInteger(settings?.handoffTtlSeconds, 60, 900, 300),
    lastRegisteredAt: normalizeOptionalIso(settings?.lastRegisteredAt),
    lastError: String(settings?.lastError ?? "").trim().slice(0, 500)
  };
}

export function normalizeCaptureBridgeBaseUrl(value: unknown): string {
  const text = String(value ?? "").trim().replace(/\/+$/u, "").slice(0, 512);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== "/" && url.pathname !== "")
      || url.port !== "8790"
      || !isTailscaleServeHostname(url.hostname)) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

/** V1 trusts identity headers only behind a private Tailscale Serve origin. */
export function isTailscaleServeHostname(value: string): boolean {
  const labels = value.trim().toLowerCase().split(".");
  return labels.length >= 3
    && labels.at(-2) === "ts"
    && labels.at(-1) === "net"
    && labels.slice(0, -2).every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function normalizeOptionalIso(value: unknown): string {
  const text = String(value ?? "").trim();
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

export interface Esp32DeviceEndpoints {
  hubOrigin: string;
  deviceId: string;
  desiredUrl: string;
  displayAckUrl: string;
  eventUrl: string;
}

export function normalizeEsp32HubOrigin(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== "/"
    || isLoopbackHostname(parsed.hostname)) {
    return undefined;
  }
  return parsed.origin;
}

export function isPrivateTailscaleServeOrigin(value: string): boolean {
  const origin = normalizeEsp32HubOrigin(value);
  if (!origin) return false;
  return new URL(origin).hostname.toLowerCase().endsWith(".ts.net");
}

export function isHubDeviceId(value: string): boolean {
  return /^dev_[0-9a-f]{32}$/u.test(value.trim());
}

export function buildEsp32DeviceEndpoints(
  hubOrigin: string,
  deviceId: string
): Esp32DeviceEndpoints | undefined {
  const origin = normalizeEsp32HubOrigin(hubOrigin);
  const normalizedDeviceId = deviceId.trim();
  if (!origin || !isHubDeviceId(normalizedDeviceId)) return undefined;
  const root = `${origin}/v1/hub/devices/${encodeURIComponent(normalizedDeviceId)}`;
  return {
    hubOrigin: origin,
    deviceId: normalizedDeviceId,
    desiredUrl: `${root}/desired?after={state_version}&wait=25`,
    displayAckUrl: `${root}/display-acks`,
    eventUrl: `${root}/events`
  };
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") {
    return true;
  }
  const ipv4 = normalized.split(".").map((part) => Number(part));
  return ipv4.length === 4
    && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && ipv4[0] === 127;
}

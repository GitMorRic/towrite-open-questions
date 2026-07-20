import { normalizeCaptureBridgeBaseUrl } from "./settings";
import type { CaptureBridgeCapabilities, CaptureBridgeSettings } from "./types";

/** Import only validated connection metadata advertised by Capture. */
export function hydrateCaptureBridgeSettings(
  settings: CaptureBridgeSettings,
  capabilities: CaptureBridgeCapabilities | undefined
): boolean {
  if (!capabilities) return false;
  let changed = false;
  if (!settings.captureBaseUrl && capabilities.captureBaseUrl) {
    const normalized = normalizeCaptureBridgeBaseUrl(capabilities.captureBaseUrl);
    if (normalized) {
      settings.captureBaseUrl = normalized;
      changed = true;
    }
  }
  if (!settings.ownerLogin && capabilities.ownerLogin) {
    const ownerLogin = capabilities.ownerLogin.trim().slice(0, 200);
    if (ownerLogin) {
      settings.ownerLogin = ownerLogin;
      changed = true;
    }
  }
  return changed;
}

import { assertNtag213Uri, type NdefUriSizeEstimate } from "../hub";
import { isCaptureTapId } from "./ids";
import { normalizeCaptureBridgeBaseUrl } from "./settings";

export function buildLocalCaptureTapUri(captureBaseUrl: string, tapId: string): string {
  if (!isCaptureTapId(tapId)) {
    throw new Error("A local Capture tap ID must be `tap_` followed by 22 base64url characters.");
  }
  const normalizedBaseUrl = normalizeCaptureBridgeBaseUrl(captureBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Capture public base URL must be a canonical https://*.ts.net:8790 Tailscale Serve origin without credentials, path, query, or fragment.");
  }
  const base = new URL(normalizedBaseUrl);
  base.pathname = `/capture/t/v1/${tapId}`;
  const uri = base.toString();
  assertNtag213Uri(uri);
  return uri;
}

export function localCaptureNdefStatus(captureBaseUrl: string, tapId: string): NdefUriSizeEstimate | undefined {
  try {
    return assertNtag213Uri(buildLocalCaptureTapUri(captureBaseUrl, tapId));
  } catch {
    return undefined;
  }
}

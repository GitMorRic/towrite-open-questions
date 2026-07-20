const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function randomBase64Url(bytesLength: number): string {
  if (!Number.isInteger(bytesLength) || bytesLength < 1) {
    throw new Error("Random byte length must be a positive integer.");
  }
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure randomness is unavailable.");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(bytesLength));
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64URL[(block >>> 18) & 63];
    output += BASE64URL[(block >>> 12) & 63];
    if (second !== undefined) output += BASE64URL[(block >>> 6) & 63];
    if (third !== undefined) output += BASE64URL[block & 63];
  }
  return output;
}

export function generateCaptureBridgeToken(): string {
  return randomBase64Url(32);
}

export function generateCaptureTapId(): string {
  return `tap_${randomBase64Url(16)}`;
}

export function generateCaptureHandoffId(): string {
  return `hnd_${randomBase64Url(16)}`;
}

export function generateCaptureId(): string {
  return `cap_${randomBase64Url(16)}`;
}

export function generateSnapshotId(): string {
  return `snp_${randomBase64Url(16)}`;
}

export function isCaptureTapId(value: string): boolean {
  return /^tap_[A-Za-z0-9_-]{22}$/u.test(value);
}

export function isCaptureHandoffId(value: string): boolean {
  return /^hnd_[A-Za-z0-9_-]{22}$/u.test(value);
}

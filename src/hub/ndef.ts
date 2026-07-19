export const NTAG213_USER_BYTES = 144;

export interface NdefUriSizeEstimate {
  uri: string;
  identifierCode: number;
  compressedPrefix: string;
  uriUtf8Bytes: number;
  encodedUriPayloadBytes: number;
  ndefRecordBytes: number;
  tlvOverheadBytes: number;
  totalBytes: number;
  capacityBytes: number;
  remainingBytes: number;
  fits: boolean;
}

export interface Ntag213UriValidation {
  valid: boolean;
  errors: string[];
  estimate: NdefUriSizeEstimate;
}

const URI_PREFIXES: Array<{ prefix: string; code: number }> = [
  { prefix: "https://www.", code: 0x02 },
  { prefix: "http://www.", code: 0x01 },
  { prefix: "https://", code: 0x04 },
  { prefix: "http://", code: 0x03 }
];

/** Includes the NDEF TLV and terminator bytes stored in an NTAG user area. */
export function estimateNdefUriSize(uri: string, capacityBytes = NTAG213_USER_BYTES): NdefUriSizeEstimate {
  const match = URI_PREFIXES.find((item) => uri.startsWith(item.prefix)) ?? { prefix: "", code: 0x00 };
  const uriUtf8Bytes = utf8Length(uri);
  const encodedUriPayloadBytes = 1 + utf8Length(uri.slice(match.prefix.length));
  // URI RTD: header, type length, payload length (1 for SR, otherwise 4), type `U`, payload.
  const ndefRecordBytes = encodedUriPayloadBytes <= 255
    ? encodedUriPayloadBytes + 4
    : encodedUriPayloadBytes + 7;
  // NDEF TLV tag + one-byte length (or FF + uint16) + record + terminator TLV.
  const tlvLengthBytes = ndefRecordBytes <= 254 ? 1 : 3;
  const tlvOverheadBytes = 1 + tlvLengthBytes + 1;
  const totalBytes = ndefRecordBytes + tlvOverheadBytes;
  return {
    uri,
    identifierCode: match.code,
    compressedPrefix: match.prefix,
    uriUtf8Bytes,
    encodedUriPayloadBytes,
    ndefRecordBytes,
    tlvOverheadBytes,
    totalBytes,
    capacityBytes,
    remainingBytes: capacityBytes - totalBytes,
    fits: totalBytes <= capacityBytes
  };
}

export function estimateNdefUriBytes(uri: string, capacityBytes = NTAG213_USER_BYTES): number {
  return estimateNdefUriSize(uri, capacityBytes).totalBytes;
}

export function validateNtag213Uri(uri: string): Ntag213UriValidation {
  const estimate = estimateNdefUriSize(uri);
  const errors: string[] = [];
  let parsed: URL | undefined;
  try {
    parsed = new URL(uri);
  } catch {
    errors.push("NFC URI must be an absolute URL.");
  }
  if (parsed) {
    if (parsed.protocol !== "https:") {
      errors.push("NFC URI must use HTTPS.");
    }
    if (parsed.username || parsed.password) {
      errors.push("NFC URI must not contain credentials.");
    }
    if (parsed.search) {
      errors.push("NFC URI must not contain query parameters or tokens.");
    }
    if (parsed.hash) {
      errors.push("NFC URI must not contain a fragment.");
    }
  }
  if (!estimate.fits) {
    errors.push(`NDEF message needs ${estimate.totalBytes} bytes; NTAG213 provides ${NTAG213_USER_BYTES}.`);
  }
  return { valid: errors.length === 0, errors, estimate };
}

export function assertNtag213Uri(uri: string): NdefUriSizeEstimate {
  const result = validateNtag213Uri(uri);
  if (!result.valid) {
    throw new Error(result.errors.join(" "));
  }
  return result.estimate;
}

/** Builds the only record that should be written to an NTAG213 in Hub V1. */
export function buildHubTapUri(publicBaseUrl: string, tapId: string): string {
  if (!/^tap_[A-Za-z0-9_-]{22}$/u.test(tapId)) {
    throw new Error("A Device Hub tap ID must be `tap_` followed by 22 base64url characters.");
  }
  let base: URL;
  try {
    base = new URL(publicBaseUrl);
  } catch {
    throw new Error("Device Hub public base URL is invalid.");
  }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Device Hub public base URL must be a canonical HTTPS origin without credentials, query, or fragment.");
  }
  base.pathname = `${base.pathname.replace(/\/+$/u, "")}/t/v1/${tapId}`.replace(/\/{2,}/gu, "/");
  const uri = base.toString();
  assertNtag213Uri(uri);
  return uri;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

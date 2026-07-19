import { describe, expect, it } from "vitest";
import {
  NTAG213_USER_BYTES,
  buildHubTapUri,
  estimateNdefUriBytes,
  estimateNdefUriSize,
  validateNtag213Uri
} from "./ndef";

describe("NTAG213 URI records", () => {
  it("counts URI-prefix compression plus NDEF and TLV overhead", () => {
    const uri = "https://example.com/t/v1/tap_0123456789abcdefghijkl";
    const remainderBytes = new TextEncoder().encode(uri.slice("https://".length)).byteLength;
    const estimate = estimateNdefUriSize(uri);

    expect(estimate.identifierCode).toBe(0x04);
    expect(estimate.encodedUriPayloadBytes).toBe(1 + remainderBytes);
    expect(estimate.ndefRecordBytes).toBe(estimate.encodedUriPayloadBytes + 4);
    expect(estimate.tlvOverheadBytes).toBe(3);
    expect(estimateNdefUriBytes(uri)).toBe(estimate.encodedUriPayloadBytes + 7);
    expect(estimate.remainingBytes).toBe(NTAG213_USER_BYTES - estimate.totalBytes);
    expect(estimate.fits).toBe(true);
  });

  it("builds a canonical static tap URL containing no credential or query token", () => {
    const uri = buildHubTapUri("https://write.example.com/", "tap_0123456789abcdefghijkl");
    expect(uri).toBe("https://write.example.com/t/v1/tap_0123456789abcdefghijkl");
    expect(validateNtag213Uri(uri).valid).toBe(true);
  });

  it("rejects non-HTTPS, query credentials, and messages larger than 144 bytes", () => {
    expect(validateNtag213Uri("http://example.com/t/v1/tap_0123456789abcdefghijkl").errors).toContain("NFC URI must use HTTPS.");
    expect(validateNtag213Uri("https://example.com/t/v1/id?token=long-lived-secret").errors)
      .toContain("NFC URI must not contain query parameters or tokens.");
    const tooLong = validateNtag213Uri(`https://example.com/t/v1/${"x".repeat(200)}`);
    expect(tooLong.valid).toBe(false);
    expect(tooLong.estimate.totalBytes).toBeGreaterThan(NTAG213_USER_BYTES);
  });

  it("counts UTF-8 bytes instead of JavaScript characters", () => {
    const ascii = estimateNdefUriSize("https://example.com/a");
    const unicode = estimateNdefUriSize("https://example.com/林");
    expect(unicode.uri.length).toBe(ascii.uri.length);
    expect(unicode.totalBytes - ascii.totalBytes).toBe(2);
  });
});

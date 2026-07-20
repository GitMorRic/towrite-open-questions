import { describe, expect, it } from "vitest";
import { buildLocalCaptureTapUri, generateCaptureBridgeToken, generateCaptureTapId, localCaptureNdefStatus } from ".";

describe("local Capture NFC URI", () => {
  it("generates independent 256-bit callback credentials and 128-bit tap IDs", () => {
    expect(generateCaptureBridgeToken()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(generateCaptureTapId()).toMatch(/^tap_[A-Za-z0-9_-]{22}$/u);
  });

  it("builds a canonical NTAG213 URI without credentials, query, or fragment", () => {
    const tapId = "tap_0123456789abcdefghijkl";
    const uri = buildLocalCaptureTapUri("https://desktop.example.ts.net:8790", tapId);
    expect(uri).toBe(`https://desktop.example.ts.net:8790/capture/t/v1/${tapId}`);
    expect(uri).not.toMatch(/[?#]/u);
    expect(localCaptureNdefStatus("https://desktop.example.ts.net:8790", tapId)).toMatchObject({ fits: true });
  });

  it("rejects non-Tailscale origins, other ports, HTTP, paths, credentials, and query tokens", () => {
    const tapId = "tap_0123456789abcdefghijkl";
    expect(() => buildLocalCaptureTapUri("http://desktop.example.ts.net:8790", tapId)).toThrow(/HTTPS/iu);
    expect(() => buildLocalCaptureTapUri("https://capture.example.com:8790", tapId)).toThrow(/Tailscale Serve/iu);
    expect(() => buildLocalCaptureTapUri("https://desktop.example.ts.net:443", tapId)).toThrow(/Tailscale Serve/iu);
    expect(() => buildLocalCaptureTapUri("https://desktop.example.ts.net:8790/capture", tapId)).toThrow(/without credentials/iu);
    expect(() => buildLocalCaptureTapUri("https://user:secret@desktop.example.ts.net:8790", tapId)).toThrow(/without credentials/iu);
    expect(() => buildLocalCaptureTapUri("https://desktop.example.ts.net:8790?token=secret", tapId)).toThrow(/without credentials/iu);
  });
});

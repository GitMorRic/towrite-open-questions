import { describe, expect, it } from "vitest";
import { CAPTURE_BRIDGE_PORT, normalizeCaptureBridgeBaseUrl, normalizeCaptureBridgeSettings } from ".";

describe("Capture bridge settings migration", () => {
  it("creates disabled local defaults with independent secure credentials", () => {
    const settings = normalizeCaptureBridgeSettings();
    expect(settings).toMatchObject({
      enabled: false,
      flow: "local_capture",
      bindHost: "127.0.0.1",
      port: CAPTURE_BRIDGE_PORT,
      captureBaseUrl: "",
      ownerLogin: ""
    });
    expect(settings.callbackToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(settings.tapId).toMatch(/^tap_[A-Za-z0-9_-]{22}$/u);
    expect(settings.callbackToken).not.toContain(settings.tapId);
  });

  it("normalizes malformed persisted settings to the fixed loopback contract", () => {
    const settings = normalizeCaptureBridgeSettings({
      enabled: true,
      flow: "invalid" as "local_capture",
      bindHost: "0.0.0.0" as "127.0.0.1",
      port: 443,
      callbackToken: "weak",
      captureBaseUrl: "https://user:secret@example.com:8790?token=leak",
      tapId: "tap_predictable",
      ownerLogin: " user@github \n",
      handoffTtlSeconds: 99_999,
      lastRegisteredAt: "not-a-date",
      lastError: "x".repeat(1_000)
    });
    expect(settings.flow).toBe("local_capture");
    expect(settings.bindHost).toBe("127.0.0.1");
    expect(settings.port).toBe(CAPTURE_BRIDGE_PORT);
    expect(settings.callbackToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(settings.tapId).toMatch(/^tap_[A-Za-z0-9_-]{22}$/u);
    expect(settings.captureBaseUrl).toBe("");
    expect(JSON.stringify(settings)).not.toContain("secret");
    expect(JSON.stringify(settings)).not.toContain("token=leak");
    expect(settings.ownerLogin).toBe("user@github");
    expect(settings.handoffTtlSeconds).toBe(900);
    expect(settings.lastRegisteredAt).toBe("");
    expect(settings.lastError).toHaveLength(500);
  });

  it("accepts only the dedicated private Tailscale Serve origin", () => {
    expect(normalizeCaptureBridgeBaseUrl("https://desktop-lea3h79.taild09a3c.ts.net:8790/"))
      .toBe("https://desktop-lea3h79.taild09a3c.ts.net:8790");
    expect(normalizeCaptureBridgeBaseUrl("https://capture.example.com:8790")).toBe("");
    expect(normalizeCaptureBridgeBaseUrl("https://desktop-lea3h79.taild09a3c.ts.net:443")).toBe("");
    expect(normalizeCaptureBridgeBaseUrl("https://desktop-lea3h79.taild09a3c.ts.net:8790/capture")).toBe("");
  });
});

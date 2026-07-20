import { describe, expect, it } from "vitest";
import { hydrateCaptureBridgeSettings } from "./discovery";
import { normalizeCaptureBridgeSettings } from "./settings";

describe("Capture bridge capability discovery", () => {
  it("hydrates and persists only validated connection metadata", () => {
    const settings = normalizeCaptureBridgeSettings();

    expect(hydrateCaptureBridgeSettings(settings, {
      protocolVersion: "towrite-capture-bridge/v1",
      handoffs: true,
      conflictDetection: true,
      undo: true,
      textCapture: true,
      captureBaseUrl: "https://desktop-lea3h79.taild09a3c.ts.net:8790",
      ownerLogin: " GitMorRic@github ",
      tailscaleServeTrusted: true
    })).toBe(true);
    expect(settings.captureBaseUrl).toBe("https://desktop-lea3h79.taild09a3c.ts.net:8790");
    expect(settings.ownerLogin).toBe("GitMorRic@github");

    const reloaded = normalizeCaptureBridgeSettings(settings);
    expect(reloaded.captureBaseUrl).toBe(settings.captureBaseUrl);
    expect(reloaded.ownerLogin).toBe(settings.ownerLogin);
    expect(reloaded.callbackToken).toBe(settings.callbackToken);
    expect(reloaded.tapId).toBe(settings.tapId);
  });

  it("does not overwrite user values or import an invalid Hub origin", () => {
    const settings = normalizeCaptureBridgeSettings({
      captureBaseUrl: "https://capture.tail1234.ts.net:8790",
      ownerLogin: "owner@github"
    });

    expect(hydrateCaptureBridgeSettings(settings, {
      protocolVersion: "towrite-capture-bridge/v1",
      handoffs: true,
      conflictDetection: true,
      undo: true,
      textCapture: true,
      captureBaseUrl: "https://desktop-lea3h79.taild09a3c.ts.net:10000",
      ownerLogin: "other@github"
    })).toBe(false);
    expect(settings.captureBaseUrl).toBe("https://capture.tail1234.ts.net:8790");
    expect(settings.ownerLogin).toBe("owner@github");
  });
});

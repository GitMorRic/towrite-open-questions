import { describe, expect, it } from "vitest";
import {
  buildEsp32DeviceEndpoints,
  isHubDeviceId,
  isPrivateTailscaleServeOrigin,
  normalizeEsp32HubOrigin
} from "./esp32-config";

const DEVICE_ID = "dev_0123456789abcdef0123456789abcdef";

describe("ESP32 Device Hub configuration", () => {
  it("accepts only canonical non-loopback HTTPS origins", () => {
    expect(normalizeEsp32HubOrigin("https://hub.example.com/")).toBe("https://hub.example.com");
    expect(normalizeEsp32HubOrigin("http://hub.example.com")).toBeUndefined();
    expect(normalizeEsp32HubOrigin("https://127.0.0.1:8080")).toBeUndefined();
    expect(normalizeEsp32HubOrigin("https://user:secret@hub.example.com")).toBeUndefined();
    expect(normalizeEsp32HubOrigin("https://hub.example.com/path?token=secret")).toBeUndefined();
  });

  it("recognizes a private Tailscale Serve origin", () => {
    expect(isPrivateTailscaleServeOrigin("https://desktop.example.ts.net:10000")).toBe(true);
    expect(isPrivateTailscaleServeOrigin("https://hub.example.com")).toBe(false);
  });

  it("requires a non-enumerable prefixed device identifier", () => {
    expect(isHubDeviceId(DEVICE_ID)).toBe(true);
    expect(isHubDeviceId("device-1")).toBe(false);
    expect(isHubDeviceId("dev_0123")).toBe(false);
  });

  it("builds desired, ACK, and event endpoints without putting a secret in the URL", () => {
    expect(buildEsp32DeviceEndpoints("https://hub.example.com", DEVICE_ID)).toEqual({
      hubOrigin: "https://hub.example.com",
      deviceId: DEVICE_ID,
      desiredUrl: `https://hub.example.com/v1/hub/devices/${DEVICE_ID}/desired?after={state_version}&wait=25`,
      displayAckUrl: `https://hub.example.com/v1/hub/devices/${DEVICE_ID}/display-acks`,
      eventUrl: `https://hub.example.com/v1/hub/devices/${DEVICE_ID}/events`
    });
  });
});

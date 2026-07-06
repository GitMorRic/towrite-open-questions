import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_PROFILES, DEFAULT_REMINDER_PRESETS, normalizeDeviceProfiles, normalizeExternalApiBindHost, normalizeExternalApiPublicBaseUrl, normalizeReminderPresets } from "./settings";

describe("settings normalization", () => {
  it("normalizes common External API bind host values", () => {
    expect(normalizeExternalApiBindHost("0.0.0.0")).toBe("0.0.0.0");
    expect(normalizeExternalApiBindHost("0.0.0.")).toBe("0.0.0.0");
    expect(normalizeExternalApiBindHost("localhost")).toBe("127.0.0.1");
    expect(normalizeExternalApiBindHost(" 192.168.1.20 ")).toBe("192.168.1.20");
    expect(normalizeExternalApiBindHost("not a host!")).toBe("127.0.0.1");
  });

  it("normalizes External API public base URLs", () => {
    expect(normalizeExternalApiPublicBaseUrl("http://100.64.1.2:48321/")).toBe("http://100.64.1.2:48321");
    expect(normalizeExternalApiPublicBaseUrl("https://towrite.example.com/device?token=secret")).toBe("https://towrite.example.com");
    expect(normalizeExternalApiPublicBaseUrl("100.64.1.2:48321")).toBe("");
    expect(normalizeExternalApiPublicBaseUrl("ftp://example.com")).toBe("");
  });

  it("normalizes reminder quick presets", () => {
    expect(normalizeReminderPresets([])).toEqual(DEFAULT_REMINDER_PRESETS);
    expect(normalizeReminderPresets([
      { label: " Soon ", value: " 15m " },
      { label: "Soon", value: "15m" },
      { label: "", value: "1h" },
      { label: "Later", value: "" }
    ])).toEqual([{ label: "Soon", value: "15m" }]);
  });

  it("normalizes device profiles", () => {
    expect(normalizeDeviceProfiles([])).toEqual(DEFAULT_DEVICE_PROFILES);
    expect(normalizeDeviceProfiles([
      {
        id: "My 2.7 Screen!",
        name: "",
        profile: "unknown" as never,
        width: 10,
        height: 9999,
        inches: 0,
        defaultPage: "bad" as never,
        defaultLane: "all" as never,
        refreshSeconds: 1
      },
      {
        id: "my-27-screen",
        name: "Duplicate",
        profile: "desktop-card",
        width: 800,
        height: 480,
        inches: 7,
        defaultPage: "cards",
        defaultLane: "write",
        refreshSeconds: 60
      }
    ])).toEqual([
      {
        id: "my-27-screen",
        name: "my-27-screen",
        profile: "eink-bw",
        width: 80,
        height: 2400,
        inches: 1,
        defaultPage: "home",
        defaultLane: "",
        refreshSeconds: 15
      }
    ]);
  });
});

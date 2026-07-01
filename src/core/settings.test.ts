import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_PRESETS, normalizeExternalApiBindHost, normalizeExternalApiPublicBaseUrl, normalizeReminderPresets } from "./settings";

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
});

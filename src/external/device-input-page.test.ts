import { describe, expect, it } from "vitest";
import { buildDeviceInputPageHtml } from "./device-input-page";

describe("device input page", () => {
  it("ships parseable recording, routing preview, and Agent approval controls", () => {
    const html = buildDeviceInputPageHtml();
    const script = /<script>([\s\S]*)<\/script>/u.exec(html)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
    expect(html).toContain("MediaRecorder");
    expect(html).toContain("/api/v1/capture/route-preview");
    expect(html).toContain("/api/v1/capture/route-commit");
    expect(html).toContain("确认并执行 Agent 提案");
  });
});

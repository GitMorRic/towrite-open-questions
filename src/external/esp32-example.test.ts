import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sketch = readFileSync(
  new URL("../../examples/esp32s3-eink/esp32s3-eink.ino", import.meta.url),
  "utf8"
);

describe("ESP32-S3 e-ink example", () => {
  it("keeps five-second content polling and redraws full cards only when content changes", () => {
    expect(sketch).toContain("const unsigned long POLL_INTERVAL_MS = 5000;");
    expect(sketch).toContain("cardId == lastRenderedCardId && revision == lastPlaylistRevision");
    expect(sketch).toContain("renderConnectionStatusIfNeeded(false);");
    expect(sketch).toContain("return; // Polling never refreshes unchanged e-ink pixels.");
  });

  it("exposes screen-rendering hooks for healthy and failed connection state", () => {
    expect(sketch).toContain("WiFi OK");
    expect(sketch).toContain("API OK");
    expect(sketch).toContain("target ");
    expect(sketch).toContain("s ago)");
    expect(sketch).toContain("void renderConnectionStatus(");
    expect(sketch).toContain("void renderError(");
    expect(sketch).toContain("STATUS_FOOTER_REFRESH_MS = 60000");
    expect(sketch).toContain("if (stateChanged || intervalElapsed)");
    expect(sketch).toContain('markConnectionError("WiFi connection timed out", 0);');
    expect(sketch).toContain('markConnectionError(String("GET /api/v1/eink returned HTTP ") + code, code);');
    expect(sketch).toContain('markConnectionError(String("JSON parse failed: ") + error.c_str(), code);');
  });

  it("uses target-bound Bearer auth without rendering or logging the token", () => {
    expect(sketch).toContain('http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);');
    expect(sketch).not.toMatch(/Serial\.(?:print|println)\([^)]*DEVICE_TOKEN/u);
    expect(sketch).not.toMatch(/render(?:Card|Empty|Error|ConnectionStatus)\([^;]*DEVICE_TOKEN/u);
    expect(sketch).not.toMatch(/[?&]token=/u);
  });

  it("keeps the large response document off the Arduino loop-task stack", () => {
    expect(sketch).toContain("DynamicJsonDocument doc(24576);");
    expect(sketch).not.toContain("StaticJsonDocument<24576>");
  });

  it("renders canonical page progress instead of treating totals or cursor zero as the page number", () => {
    expect(sketch).toContain('const int currentIndex = playlist["currentIndex"] | 0;');
    expect(sketch).toContain('const int currentPosition = playlist["currentPosition"] | (currentIndex + 1);');
    expect(sketch).toContain('const bool currentInQueue = playlist.containsKey("currentInQueue")');
    expect(sketch).toContain('? String("page ") + String(currentPosition) + "/" + String(queueTotal)');
    expect(sketch).toContain(': String("single preview");');
    expect(sketch).toContain('const int playlistTotal = playlist["total"] | focus.size();');
    expect(sketch).toContain('const int queueTotal = playlist["queueTotal"] | playlistTotal;');
    expect(sketch).not.toContain('const String summaryText = String("open ")');
    expect(sketch).not.toMatch(/pageText[\s\S]{0,160}playlist\["cursor"\]/u);
  });

  it("labels Echo templates as samples instead of inheriting the legacy ToWrite lane", () => {
    expect(sketch).toContain("String displayCategoryFor(JsonObject card)");
    expect(sketch).toContain('const String category = card["displayCategory"] | "";');
    expect(sketch).toContain('if (category == "echo") return "Echo sample";');
    expect(sketch).toContain('if (sourceType == "echo") return "Echo sample";');
    expect(sketch).toContain('Serial.println(displayCategory + " | " + article);');
    expect(sketch).not.toContain('Serial.println(sourceType + " | " + lane + " | " + article);');
  });
});

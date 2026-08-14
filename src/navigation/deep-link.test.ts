import { describe, expect, it } from "vitest";
import { DeepLinkNavigationAdapter, resolveApprovedDeepLink } from "./deep-link";
import { NAVIGATION_TARGET_SCHEMA_VERSION } from "./types";

describe("DeepLinkNavigationAdapter", () => {
  it("opens a locally approved application URI", async () => {
    const opened: string[] = [];
    const adapter = new DeepLinkNavigationAdapter({
      openWindow: (url) => opened.push(url)
    });
    const result = await adapter.open({
      schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
      provider: "deep-link",
      url: "vscode://file/C:/Projects/ToWrite/readme.md:12"
    }, { displayedValidated: true, eventId: "evt_1" });
    expect(result.status).toBe("opened");
    expect(opened).toEqual(["vscode://file/C:/Projects/ToWrite/readme.md:12"]);
  });

  it.each([
    "javascript:alert(1)",
    "file:///C:/private.txt",
    "https://example.com",
    "ms-settings:privacy",
    " vscode://file/C:/Project "
  ])("blocks command-like or browser-owned schemes: %s", async (url) => {
    expect(resolveApprovedDeepLink(url)).toBeUndefined();
  });
});

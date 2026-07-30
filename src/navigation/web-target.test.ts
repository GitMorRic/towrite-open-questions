import { describe, expect, it, vi } from "vitest";
import { NAVIGATION_TARGET_SCHEMA_VERSION, type WebNavigationTarget } from "./types";
import { WebNavigationAdapter } from "./web-target";

function target(url: string, fragment?: string): WebNavigationTarget {
  return {
    schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
    provider: "web",
    url,
    fragment
  };
}

const context = { displayedValidated: true };

describe("WebNavigationAdapter", () => {
  it("opens a validated HTTPS target through the injected external launcher", async () => {
    const openExternal = vi.fn(async () => undefined);
    const openWindow = vi.fn();
    const adapter = new WebNavigationAdapter({ openExternal, openWindow });

    await expect(adapter.open(
      target("https://example.com/read?from=todo", ":~:text=resume%20here"),
      context
    )).resolves.toMatchObject({
      status: "opened",
      exact: true,
      focused: false,
      provider: "web"
    });
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(
      "https://example.com/read?from=todo#:~:text=resume%20here"
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("uses a no-opener, no-referrer browser window when no external launcher is supplied", async () => {
    const openWindow = vi.fn();
    const adapter = new WebNavigationAdapter({ openWindow });

    await expect(adapter.open(
      target("https://example.com/note#existing"),
      context
    )).resolves.toMatchObject({ status: "opened" });
    expect(openWindow).toHaveBeenCalledWith(
      "https://example.com/note#existing",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it.each([
    ["HTTP", "http://example.com/read"],
    ["an executable scheme", "javascript:alert(1)"],
    ["username credentials", "https://reader@example.com/read"],
    ["password credentials", "https://reader:secret@example.com/read"],
    ["a malformed URL", "not a url"],
    ["surrounding whitespace", " https://example.com/read "]
  ])("blocks %s before invoking a launcher", async (_label, url) => {
    const openExternal = vi.fn();
    const openWindow = vi.fn();
    const adapter = new WebNavigationAdapter({ openExternal, openWindow });

    await expect(adapter.open(target(url), context)).resolves.toMatchObject({
      status: "blocked",
      exact: false,
      focused: false,
      provider: "web"
    });
    expect(openExternal).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("reports a launcher failure without throwing", async () => {
    const openExternal = vi.fn(async () => {
      throw new Error("launcher failed");
    });
    const adapter = new WebNavigationAdapter({ openExternal });

    await expect(adapter.open(
      target("https://example.com/read"),
      context
    )).resolves.toMatchObject({
      status: "blocked",
      exact: false,
      provider: "web"
    });
  });
});

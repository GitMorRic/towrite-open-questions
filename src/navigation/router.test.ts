import { describe, expect, it, vi } from "vitest";
import { NavigationRouter } from "./router";
import {
  NAVIGATION_TARGET_SCHEMA_VERSION,
  type NavigationAdapter,
  type ObsidianNavigationTarget
} from "./types";

const target: ObsidianNavigationTarget = {
  schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
  provider: "obsidian",
  filePath: "Projects/Echo.md",
  sourcePath: "Daily/2026-07-27.md",
  locations: [{ kind: "block", blockId: "daily_echo" }]
};

describe("NavigationRouter", () => {
  it("dispatches a displayed-validated target to its provider adapter", async () => {
    const open = vi.fn(async () => ({
      status: "opened" as const,
      exact: true,
      focused: true,
      provider: "obsidian" as const,
      message: "Opened"
    }));
    const adapter: NavigationAdapter<ObsidianNavigationTarget> = {
      provider: "obsidian",
      open
    };
    const router = new NavigationRouter();
    router.register(adapter);

    await expect(router.open(target, {
      eventId: "evt_primary_single",
      displayedValidated: true
    })).resolves.toMatchObject({ status: "opened", exact: true });
    expect(open).toHaveBeenCalledWith(target, {
      eventId: "evt_primary_single",
      displayedValidated: true
    });
  });

  it("blocks a remote command that did not validate displayed state", async () => {
    const open = vi.fn();
    const router = new NavigationRouter();
    router.register({ provider: "obsidian", open });

    await expect(router.open(target, {
      eventId: "evt_unchecked",
      displayedValidated: false
    })).resolves.toMatchObject({ status: "blocked" });
    expect(open).not.toHaveBeenCalled();
  });

  it("does not execute future providers before their adapter is enabled", async () => {
    const router = new NavigationRouter();
    await expect(router.open({
      schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
      provider: "web",
      url: "https://example.com/note"
    }, {
      displayedValidated: true
    })).resolves.toMatchObject({
      status: "unsupported",
      provider: "web"
    });
  });
});

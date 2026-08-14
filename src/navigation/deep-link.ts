import type {
  DeepLinkNavigationTarget,
  NavigationAdapter,
  NavigationOpenContext,
  NavigationOpenResult
} from "./types";

export type DeepLinkOpenWindow = (
  url: string,
  target: string,
  features: string
) => unknown;

export interface DeepLinkNavigationAdapterOptions {
  openWindow?: DeepLinkOpenWindow;
}

const BLOCKED_SCHEMES = new Set([
  "about",
  "blob",
  "chrome",
  "data",
  "edge",
  "file",
  "http",
  "https",
  "javascript",
  "mailto",
  "ms-settings",
  "shell",
  "sms",
  "tel",
  "vbscript"
]);

/**
 * Opens a user-authored application deep link without exposing a generic
 * command runner. The URL is accepted only from local settings and dangerous
 * browser/OS schemes stay blocked even there.
 */
export class DeepLinkNavigationAdapter implements NavigationAdapter<DeepLinkNavigationTarget> {
  readonly provider = "deep-link" as const;
  private readonly openWindow: DeepLinkOpenWindow;

  constructor(options: DeepLinkNavigationAdapterOptions = {}) {
    this.openWindow = options.openWindow ?? defaultOpenWindow;
  }

  async open(
    target: DeepLinkNavigationTarget,
    _context: NavigationOpenContext
  ): Promise<NavigationOpenResult> {
    const url = resolveApprovedDeepLink(target.url);
    if (!url) return failure("The configured application deep link is not allowed.");
    try {
      this.openWindow(url, "_blank", "noopener,noreferrer");
    } catch {
      return failure("The configured application deep link could not be opened.");
    }
    return {
      status: "opened",
      exact: true,
      focused: false,
      provider: "deep-link",
      message: "Opened approved application deep link."
    };
  }
}

export function resolveApprovedDeepLink(value: string): string | undefined {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2_048) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    const scheme = parsed.protocol.slice(0, -1).toLowerCase();
    if (!/^[a-z][a-z0-9+.-]{1,31}$/u.test(scheme) || BLOCKED_SCHEMES.has(scheme)) {
      return undefined;
    }
    if (parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function failure(message: string): NavigationOpenResult {
  return {
    status: "blocked",
    exact: false,
    focused: false,
    provider: "deep-link",
    message
  };
}

function defaultOpenWindow(url: string, target: string, features: string): unknown {
  if (typeof window === "undefined") throw new Error("Browser window is unavailable.");
  return window.open(url, target, features);
}

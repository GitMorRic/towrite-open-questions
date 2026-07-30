import type {
  NavigationAdapter,
  NavigationOpenContext,
  NavigationOpenResult,
  WebNavigationTarget
} from "./types";

export type WebOpenExternal = (url: string) => void | Promise<void>;
export type WebOpenWindow = (
  url: string,
  target: string,
  features: string
) => unknown;

export interface WebNavigationAdapterOptions {
  /**
   * A platform-owned external URL launcher, such as Electron's
   * `shell.openExternal`. When present, it is preferred to `window.open`.
   */
  openExternal?: WebOpenExternal;
  /** Injectable browser fallback. */
  openWindow?: WebOpenWindow;
}

/**
 * Opens only absolute HTTPS URLs. URL parsing and credential checks happen
 * before either injected launcher can observe the target.
 */
export class WebNavigationAdapter implements NavigationAdapter<WebNavigationTarget> {
  readonly provider = "web" as const;
  private readonly openExternal?: WebOpenExternal;
  private readonly openWindow: WebOpenWindow;

  constructor(options: WebNavigationAdapterOptions = {}) {
    this.openExternal = options.openExternal;
    this.openWindow = options.openWindow ?? defaultOpenWindow;
  }

  async open(
    target: WebNavigationTarget,
    _context: NavigationOpenContext
  ): Promise<NavigationOpenResult> {
    const url = resolveHttpsUrl(target);
    if (!url) {
      return failure("The web target must be a valid HTTPS URL without credentials.");
    }

    try {
      if (this.openExternal) {
        await this.openExternal(url);
      } else {
        this.openWindow(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      return failure("The HTTPS URL could not be opened.");
    }

    return {
      status: "opened",
      exact: true,
      focused: false,
      provider: "web",
      message: "Opened HTTPS URL."
    };
  }
}

function resolveHttpsUrl(target: WebNavigationTarget): string | undefined {
  if (typeof target.url !== "string" || target.url.length === 0) return undefined;
  if (target.url !== target.url.trim()) return undefined;
  if (target.fragment !== undefined && typeof target.fragment !== "string") {
    return undefined;
  }

  try {
    const parsed = new URL(target.url);
    if (parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    if (target.fragment !== undefined) {
      parsed.hash = target.fragment;
    }
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
    provider: "web",
    message
  };
}

function defaultOpenWindow(url: string, target: string, features: string): unknown {
  if (typeof window === "undefined") {
    throw new Error("Browser window is unavailable.");
  }
  return window.open(url, target, features);
}

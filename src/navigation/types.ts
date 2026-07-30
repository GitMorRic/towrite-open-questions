export const NAVIGATION_TARGET_SCHEMA_VERSION = 1 as const;

export type NavigationTarget =
  | ObsidianNavigationTarget
  | WebNavigationTarget
  | ProviderNavigationTarget;

export type ObsidianNavigationLocation =
  | {
      kind: "heading";
      heading: string;
    }
  | {
      kind: "block";
      blockId: string;
    }
  | {
      kind: "line";
      range: NavigationLineRange;
    }
  | {
      kind: "text";
      anchor: NavigationTextAnchor;
    }
  | {
      kind: "pdf-page";
      /** One-based human-facing PDF page number. */
      page: number;
    };

export interface NavigationLineRange {
  start: number;
  end?: number;
}

export interface NavigationTextAnchor {
  startOffset: number;
  endOffset: number;
  selectedText: string;
  before: string;
  after: string;
}

/**
 * Local-only target understood by the Obsidian Connector.
 *
 * `filePath` is preferred when the caller already resolved a canonical Vault
 * path. `linkText` is retained for normal Obsidian relative-link resolution.
 * Neither value is sent to Device Hub; remote events carry only opaque refs.
 */
export interface ObsidianNavigationTarget {
  schemaVersion: typeof NAVIGATION_TARGET_SCHEMA_VERSION;
  provider: "obsidian";
  filePath?: string;
  linkText?: string;
  sourcePath: string;
  /**
   * Ordered exact-location fallbacks. For example, question cards use stable
   * block → contextual text anchor → last-known line.
   */
  locations?: ObsidianNavigationLocation[];
  label?: string;
}

/**
 * Reserved for an explicitly enabled HTTPS adapter. V1 deliberately does not
 * register this adapter, so a device cannot make the desktop open arbitrary
 * URLs.
 */
export interface WebNavigationTarget {
  schemaVersion: typeof NAVIGATION_TARGET_SCHEMA_VERSION;
  provider: "web";
  url: string;
  fragment?: string;
  label?: string;
}

/**
 * Reserved for named provider adapters such as another note application.
 * `resourceRef` is adapter-owned data, not an executable URI.
 */
export interface ProviderNavigationTarget {
  schemaVersion: typeof NAVIGATION_TARGET_SCHEMA_VERSION;
  provider: "provider";
  adapterId: string;
  resourceRef: string;
  locationRef?: string;
  label?: string;
}

export interface NavigationOpenContext {
  eventId?: string;
  /** Remote device actions must have passed displayed-tuple validation first. */
  displayedValidated: boolean;
}

export interface NavigationOpenResult {
  status: "opened" | "not-found" | "blocked" | "unsupported";
  exact: boolean;
  focused: boolean;
  provider: NavigationTarget["provider"];
  message: string;
}

export interface NavigationAdapter<TTarget extends NavigationTarget = NavigationTarget> {
  readonly provider: TTarget["provider"];
  open(target: TTarget, context: NavigationOpenContext): Promise<NavigationOpenResult>;
}

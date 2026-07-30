import {
  MarkdownView,
  TFile,
  normalizePath,
  resolveSubpath,
  type App,
  type CachedMetadata,
  type SubpathResult
} from "obsidian";
import { lineRangeForOffsets, resolveQuestionAnchor } from "../core/anchor";
import type {
  NavigationAdapter,
  NavigationLineRange,
  NavigationOpenContext,
  NavigationOpenResult,
  ObsidianNavigationLocation,
  ObsidianNavigationTarget
} from "../navigation";

interface ResolvedObsidianLocation {
  line?: NavigationLineRange;
  subpath?: string;
  page?: number;
}

export interface ObsidianNavigationAdapterOptions {
  focusWindow?: () => boolean;
  resolveSubpath?: (
    cache: CachedMetadata,
    subpath: string
  ) => SubpathResult | null;
}

/**
 * The only navigation provider enabled in V1. It resolves a canonical local
 * TFile first, validates the requested location, and then opens that exact
 * leaf. Arbitrary device-supplied paths or URI schemes never reach this class.
 */
export class ObsidianNavigationAdapter implements NavigationAdapter<ObsidianNavigationTarget> {
  readonly provider = "obsidian" as const;
  private readonly focusWindow: () => boolean;
  private readonly resolveCachedSubpath: NonNullable<ObsidianNavigationAdapterOptions["resolveSubpath"]>;

  constructor(
    private readonly app: App,
    options: ObsidianNavigationAdapterOptions = {}
  ) {
    this.focusWindow = options.focusWindow ?? bestEffortFocusWindow;
    this.resolveCachedSubpath = options.resolveSubpath ?? resolveSubpath;
  }

  async open(
    target: ObsidianNavigationTarget,
    _context: NavigationOpenContext
  ): Promise<NavigationOpenResult> {
    const file = this.resolveFile(target);
    if (!file) {
      return failure("not-found", "The target note no longer exists.");
    }
    const location = await this.resolveLocation(file, target.locations ?? []);
    if ((target.locations?.length ?? 0) > 0 && !location) {
      return failure("not-found", "The requested note location no longer exists.");
    }

    const leaf = this.app.workspace.getLeaf(false);
    const state = location?.page ? { page: location.page } : undefined;
    const eState = {
      ...(state ?? {}),
      ...(location?.subpath ? { subpath: location.subpath } : {})
    };
    await leaf.openFile(file, {
      active: true,
      state,
      eState: Object.keys(eState).length ? eState : undefined
    });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });

    let exact = !location?.line;
    if (location?.line && leaf.view instanceof MarkdownView) {
      exact = revealLine(leaf.view, location.line);
    }
    const focused = this.focusWindow();
    return {
      status: "opened",
      exact,
      focused,
      provider: "obsidian",
      message: exact ? "Opened exact note location." : "Opened note; exact editor position is unavailable."
    };
  }

  private resolveFile(target: ObsidianNavigationTarget): TFile | undefined {
    const directPath = target.filePath?.trim();
    if (directPath) {
      const direct = this.app.vault.getFileByPath(normalizePath(directPath));
      if (direct) return direct;
    }
    const linkText = target.linkText?.trim();
    return linkText
      ? this.app.metadataCache.getFirstLinkpathDest(linkText, target.sourcePath) ?? undefined
      : undefined;
  }

  private async resolveLocation(
    file: TFile,
    candidates: readonly ObsidianNavigationLocation[]
  ): Promise<ResolvedObsidianLocation | undefined> {
    if (!candidates.length) return {};
    let content: string | undefined;
    for (const candidate of candidates) {
      if (candidate.kind === "pdf-page") {
        if (file.extension.toLowerCase() === "pdf" && candidate.page > 0) {
          return { page: candidate.page };
        }
        continue;
      }
      if (file.extension.toLowerCase() !== "md") continue;
      if (candidate.kind === "block" || candidate.kind === "heading") {
        const subpath = candidate.kind === "block"
          ? `#^${candidate.blockId}`
          : `#${candidate.heading}`;
        const cache = this.app.metadataCache.getFileCache(file);
        const resolved = cache ? this.resolveCachedSubpath(cache, subpath) : null;
        if (resolved) {
          return {
            subpath,
            line: {
              start: resolved.start.line,
              end: resolved.end?.line ?? resolved.start.line
            }
          };
        }
        continue;
      }
      content ??= await this.app.vault.cachedRead(file);
      if (candidate.kind === "text") {
        const resolved = resolveQuestionAnchor(content, candidate.anchor);
        if (!resolved.orphaned) {
          const range = lineRangeForOffsets(content, resolved.startOffset, resolved.endOffset);
          return {
            line: {
              start: range.lineStart,
              end: range.lineEnd
            }
          };
        }
        continue;
      }
      return {
        line: clampLineRange(content, candidate.range)
      };
    }
    return undefined;
  }
}

function clampLineRange(content: string, range: NavigationLineRange): NavigationLineRange {
  const lastLine = Math.max(0, content.split(/\r?\n/u).length - 1);
  const start = clampInteger(range.start, 0, lastLine);
  return {
    start,
    end: clampInteger(range.end ?? start, start, lastLine)
  };
}

function revealLine(view: MarkdownView, range: NavigationLineRange): boolean {
  const editor = view.editor;
  if (!editor) return false;
  const lastLine = Math.max(0, editor.lineCount() - 1);
  const startLine = clampInteger(range.start, 0, lastLine);
  const endLine = clampInteger(range.end ?? startLine, startLine, lastLine);
  const from = { line: startLine, ch: 0 };
  const to = { line: endLine, ch: editor.getLine(endLine).length };
  editor.setCursor(from);
  editor.scrollIntoView({ from, to }, true);
  flashTargetLine(view);
  return true;
}

function flashTargetLine(view: MarkdownView): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    const line = view.containerEl.querySelector<HTMLElement>(".cm-line.cm-active")
      ?? view.containerEl.querySelector<HTMLElement>(".cm-active");
    if (!line) return;
    line.addClass("towrite-editor-line-flash");
    window.setTimeout(() => line.removeClass("towrite-editor-line-flash"), 1500);
  }, 80);
}

function failure(
  status: "not-found" | "blocked" | "unsupported",
  message: string
): NavigationOpenResult {
  return {
    status,
    exact: false,
    focused: false,
    provider: "obsidian",
    message
  };
}

function bestEffortFocusWindow(): boolean {
  try {
    window.focus();
    return typeof document === "undefined" || typeof document.hasFocus !== "function"
      ? true
      : document.hasFocus();
  } catch {
    return false;
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, finite));
}

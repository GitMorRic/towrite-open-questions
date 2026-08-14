import { contentHash128 } from "../core/hash";
import type {
  DailyMarkdownTarget,
  DailyPlanGroup,
  DailyPlanLineage,
  DailyTargetResolution,
  DailyWebTarget
} from "./types";

const WIKILINK_RE = /(?<!!)\[\[(?<target>[^\]\r\n]+)\]\]/gu;
const MARKDOWN_LINK_RE = /(?<!!)\[(?<label>[^\]\r\n]*)\]\((?<target>[^)\r\n]+)\)/gu;
const TARGET_FIELD_RE = /\[towrite-target::\s*(?<value>\[\[[^\]\r\n]+\]\]|[^\]\r\n]+)\]/iu;
const ACTION_FIELD_RE = /\[towrite-action::\s*(?<value>[^\]\r\n]*)\]/iu;
const ATTACHMENT_EXTENSION_RE =
  /\.(?:avif|bmp|canvas|csv|docx?|excalidraw|gif|heic|ico|jpe?g|json|m4a|m4v|mkv|mov|mp3|mp4|ogg|opus|pdf|png|pptx?|svg|tiff?|wav|webm|webp|xlsx?|zip)$/iu;

export interface DailyTargetResolverInput {
  sourcePath: string;
  taskText: string;
  rawBlock?: string;
  blockId?: string;
  explicitTarget?: string;
  explicitActionId?: string;
  lineage?: DailyPlanLineage | readonly DailyPlanGroup[];
}

export interface DailyTargetParseOptions {
  /** Resolve a Markdown link relative to the note that contains it. */
  sourcePath?: string;
}

/**
 * Parses only local Obsidian wikilinks and safe relative Markdown `.md` links.
 * Images, URLs, absolute paths, query strings and traversal are deliberately
 * excluded from device/open commands.
 */
export function parseDailyMarkdownTargets(
  markdown: string,
  options: DailyTargetParseOptions = {}
): DailyMarkdownTarget[] {
  const targets: Array<{ index: number; target: DailyMarkdownTarget }> = [];
  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const parsed = parseWikilink(
      match.groups?.target ?? "",
      match[0],
      options.sourcePath
    );
    if (parsed) targets.push({ index: match.index, target: parsed });
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const parsed = parseMarkdownLink(
      match.groups?.target ?? "",
      match.groups?.label ?? "",
      match[0],
      options.sourcePath
    );
    if (parsed) targets.push({ index: match.index, target: parsed });
  }
  return uniqueTargets(targets.sort((left, right) => left.index - right.index).map((entry) => entry.target));
}

/**
 * Returns true only when the authored list-item body is exactly one safe local
 * note link. This deliberately excludes prose containing a link: those rows
 * still need an explicit normalization choice because turning them into a task
 * could change the author's intent.
 */
export function isPureDailyNoteLinkText(
  markdown: string,
  options: DailyTargetParseOptions = {}
): boolean {
  const targets = parseDailyMarkdownTargets(markdown, options);
  if (targets.length !== 1) return false;
  const raw = targets[0].raw;
  const index = markdown.indexOf(raw);
  if (index < 0) return false;
  return `${markdown.slice(0, index)}${markdown.slice(index + raw.length)}`.trim().length === 0;
}

export function extractExplicitDailyTarget(rawBlock: string): string | undefined {
  return TARGET_FIELD_RE.exec(rawBlock)?.groups?.value.trim();
}

export function extractExplicitDailyAction(rawBlock: string): string | undefined {
  return ACTION_FIELD_RE.exec(rawBlock)?.groups?.value.trim();
}

export function createDailyLineage(
  groups: readonly DailyPlanGroup[],
  sourcePath: string,
  _date: string
): DailyPlanLineage {
  const cloned = groups.map((group) => ({
    ...group,
    links: group.links.map((link) => ({ ...link }))
  }));
  const material = cloned.map((group) => group.rawLine ?? group.text).join("\n");
  return {
    groups: cloned,
    revision: `dlr_${contentHash128(`${sourcePath}\n${material}`)}`
  };
}

export function resolveDailyTarget(input: DailyTargetResolverInput): DailyTargetResolution {
  const lineage = normalizeLineage(input.lineage, input.sourcePath);
  const authoredAction = input.explicitActionId
    ?? (input.rawBlock ? extractExplicitDailyAction(input.rawBlock) : undefined);
  if (authoredAction !== undefined) {
    const actionId = normalizeDailyActionId(authoredAction);
    return {
      source: "action",
      actionId,
      displayLabel: actionId || "Invalid desktop action",
      lineageRevision: lineage.revision
    };
  }
  const explicit = input.explicitTarget
    ?? (input.rawBlock ? extractExplicitDailyTarget(input.rawBlock) : undefined);
  const explicitLink = explicit
    ? parseExplicitTarget(explicit, input.sourcePath)
    : undefined;
  if (explicitLink) {
    return resolved("explicit", explicitLink, lineage.revision);
  }
  const explicitWeb = explicit ? parseExplicitWebTarget(explicit) : undefined;
  if (explicitWeb) {
    return {
      source: "explicit",
      webTarget: explicitWeb,
      displayLabel: explicitWeb.label,
      lineageRevision: lineage.revision
    };
  }

  const own = parseDailyMarkdownTargets(input.taskText, { sourcePath: input.sourcePath })[0];
  if (own) return resolved("task-link", own, lineage.revision);

  for (let index = lineage.groups.length - 1; index >= 0; index -= 1) {
    const ancestor = lineage.groups[index].links[0]
      ?? parseDailyMarkdownTargets(lineage.groups[index].text, { sourcePath: input.sourcePath })[0];
    if (ancestor) return resolved("ancestor-link", ancestor, lineage.revision);
  }

  if (input.blockId) {
    return {
      source: "task-block",
      sourcePath: input.sourcePath,
      blockId: input.blockId,
      displayLabel: `^${input.blockId}`,
      lineageRevision: lineage.revision
    };
  }
  return {
    source: "dashboard",
    displayLabel: "ToWrite 今日",
    lineageRevision: lineage.revision
  };
}

export function normalizeDailyActionId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(normalized) ? normalized : undefined;
}

function normalizeLineage(
  value: DailyPlanLineage | readonly DailyPlanGroup[] | undefined,
  sourcePath: string
): DailyPlanLineage {
  if (!value) return { groups: [], revision: `dlr_${contentHash128(`${sourcePath}\n`)}` };
  if ("revision" in value && "groups" in value) return value;
  const groups = [...value];
  return {
    groups,
    revision: `dlr_${contentHash128(`${sourcePath}\n${groups.map((group) => group.rawLine ?? group.text).join("\n")}`)}`
  };
}

export function isSafeDailyMarkdownPath(value: string): boolean {
  return Boolean(normalizeRelativeMarkdownPath(value));
}

function resolved(
  source: "explicit" | "task-link" | "ancestor-link",
  target: DailyMarkdownTarget,
  lineageRevision: string
): DailyTargetResolution {
  return {
    source,
    target,
    displayLabel: target.label || target.linkText,
    lineageRevision
  };
}

function parseExplicitTarget(value: string, sourcePath: string): DailyMarkdownTarget | undefined {
  const trimmed = value.trim();
  const parsed = parseDailyMarkdownTargets(trimmed, { sourcePath })[0];
  if (parsed) return parsed;
  // Link-shaped input that failed the safe parser must not be reinterpreted
  // as a plain Obsidian note name (for example `[[reference.pdf]]`).
  if (/^!?\[\[/u.test(trimmed) || /^\[[^\]]*\]\(/u.test(trimmed)) return undefined;
  const path = normalizeRelativeMarkdownPath(trimmed, sourcePath);
  if (path) {
    return {
      kind: "markdown",
      raw: trimmed,
      linkText: path,
      path,
      label: basename(path)
    };
  }
  // A plain Obsidian link text remains local and is resolved by Obsidian's
  // metadata cache. Protocol-looking and path-traversing values are rejected.
  if (!trimmed || isUnsafeLinkValue(trimmed)) return undefined;
  const ref = splitSubpath(trimmed);
  if (!ref.note) {
    if (!sourcePath || (!ref.heading && !ref.blockId)) return undefined;
    return {
      kind: "wikilink",
      raw: trimmed,
      linkText: sourcePath,
      path: sourcePath,
      heading: ref.heading,
      blockId: ref.blockId,
      label: ref.heading || (ref.blockId ? `^${ref.blockId}` : sourcePath)
    };
  }
  if (ATTACHMENT_EXTENSION_RE.test(ref.note)) return undefined;
  return {
    kind: "wikilink",
    raw: trimmed,
    linkText: ref.note,
    heading: ref.heading,
    blockId: ref.blockId,
    label: ref.note
  };
}

function parseExplicitWebTarget(value: string): DailyWebTarget | undefined {
  const trimmed = value.trim();
  if (!/^https:\/\//iu.test(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return {
      kind: "web",
      raw: value,
      url: parsed.href,
      label: `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`
    };
  } catch {
    return undefined;
  }
}

function parseWikilink(
  value: string,
  raw: string,
  sourcePath: string | undefined
): DailyMarkdownTarget | undefined {
  const [destination, alias] = splitOnce(value, "|");
  const ref = splitSubpath(destination.trim());
  if (!ref.note) {
    if (!sourcePath || (!ref.heading && !ref.blockId)) return undefined;
    return {
      kind: "wikilink",
      raw,
      linkText: sourcePath,
      path: sourcePath,
      label: alias?.trim() || ref.heading || (ref.blockId ? `^${ref.blockId}` : sourcePath),
      heading: ref.heading,
      blockId: ref.blockId
    };
  }
  if (isUnsafeLinkValue(ref.note) || ATTACHMENT_EXTENSION_RE.test(ref.note)) return undefined;
  return {
    kind: "wikilink",
    raw,
    linkText: ref.note,
    label: alias?.trim() || ref.note,
    heading: ref.heading,
    blockId: ref.blockId
  };
}

function parseMarkdownLink(
  value: string,
  label: string,
  raw: string,
  sourcePath: string | undefined
): DailyMarkdownTarget | undefined {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
  const [pathPart, fragment] = splitOnce(target, "#");
  const path = normalizeRelativeMarkdownPath(pathPart, sourcePath);
  if (!path) return undefined;
  const subpath = parseFragment(fragment);
  return {
    kind: "markdown",
    raw,
    linkText: path,
    path,
    label: label.trim() || basename(path),
    heading: subpath.heading,
    blockId: subpath.blockId
  };
}

function normalizeRelativeMarkdownPath(value: string, sourcePath?: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.trim());
  } catch {
    return undefined;
  }
  const normalized = decoded.replace(/\\/gu, "/");
  if (!normalized
    || !normalized.toLowerCase().endsWith(".md")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized)
    || /^[\\/]/u.test(normalized)
    || /\p{Cc}/u.test(normalized)
    || normalized.includes("?")) {
    return undefined;
  }
  const sourceDirectory = sourcePath?.replace(/\\/gu, "/").split("/").slice(0, -1) ?? [];
  const parts = normalized.split("/");
  const resolved = resolvePathParts(sourceDirectory, parts);
  return resolved?.join("/");
}

function resolvePathParts(base: string[], values: string[]): string[] | undefined {
  const result = [...base];
  for (const raw of values) {
    const part = raw.trim();
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!result.length) return undefined;
      result.pop();
      continue;
    }
    if (part !== raw || /[\p{Cc}:*?"<>|]/u.test(part)) return undefined;
    result.push(part);
  }
  return result.length ? result : undefined;
}

function isUnsafeLinkValue(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
    || /^[\\/]/u.test(value)
    || /^\/\//u.test(value)
    || /\p{Cc}/u.test(value)
    || value.split(/[\\/]/u).some((part) => part === "..");
}

function splitSubpath(value: string): { note: string; heading?: string; blockId?: string } {
  const [note, fragment] = splitOnce(value, "#");
  return { note: note.trim(), ...parseFragment(fragment) };
}

function parseFragment(value: string | undefined): { heading?: string; blockId?: string } {
  let fragment = value?.trim();
  if (!fragment) return {};
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    return {};
  }
  if (/\p{Cc}/u.test(fragment)) return {};
  return fragment.startsWith("^")
    ? { blockId: fragment.slice(1).trim() || undefined }
    : { heading: fragment };
}

function splitOnce(value: string, delimiter: string): [string, string | undefined] {
  const index = value.indexOf(delimiter);
  return index < 0
    ? [value, undefined]
    : [value.slice(0, index), value.slice(index + delimiter.length)];
}

function uniqueTargets(values: DailyMarkdownTarget[]): DailyMarkdownTarget[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.kind}\u0000${value.linkText}\u0000${value.heading ?? ""}\u0000${value.blockId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/iu, "") ?? path;
}

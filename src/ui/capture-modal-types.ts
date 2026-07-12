import type {
  CaptureCommitResult,
  CaptureDraft,
  CapturePreview,
  CaptureTargetCandidate
} from "../capture/types";
import type { ToWriteLanguage } from "../core/settings";

/** Local-only context shown above the editor. It is never sent anywhere by the modal. */
export interface CaptureModalContext {
  sourceLabel?: string;
  sourceFile?: string;
  headingPath?: string[];
  selection?: string;
  questionId?: string;
  questionTitle?: string;
  questionText?: string;
}

export interface CaptureModalSubmitRequest {
  draft: CaptureDraft;
  candidate?: CaptureTargetCandidate;
  preview?: CapturePreview;
  /** Preview revision preferred for conflict-safe commits; candidate revision is the fallback. */
  targetRevision?: string;
  /** Answer mode always appends to the question card. This flag additionally archives it. */
  archiveAnswer: boolean;
}

/**
 * A card-only answer has no capture result. Hosts can still expose open/undo actions with
 * canOpen/canUndo and implement those actions in the callbacks below.
 */
export interface CaptureModalSubmitResult {
  capture?: CaptureCommitResult;
  message?: string;
  openLabel?: string;
  canOpen?: boolean;
  canUndo?: boolean;
}

export interface CaptureModalCallbacks {
  recommend(
    draft: CaptureDraft,
    signal: AbortSignal,
    /** Publish an optional late Backend rerank without delaying local candidates. */
    publishUpdate: (candidates: CaptureTargetCandidate[]) => void
  ): Promise<CaptureTargetCandidate[]>;
  preview(
    draft: CaptureDraft,
    candidate: CaptureTargetCandidate,
    signal: AbortSignal
  ): Promise<CapturePreview>;
  submit(request: CaptureModalSubmitRequest): Promise<CaptureModalSubmitResult>;
  openResult?(result: CaptureModalSubmitResult): Promise<void> | void;
  undoResult?(result: CaptureModalSubmitResult): Promise<void> | void;
}

export interface CaptureModalProps {
  draft: CaptureDraft;
  callbacks: CaptureModalCallbacks;
  context?: CaptureModalContext;
  initialCandidates?: CaptureTargetCandidate[];
  language?: ToWriteLanguage;
  autoFocus?: boolean;
  onRequestClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function parseCaptureTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const token of value.split(/[,\s\uFF0C\u3001\uFF1B]+/u)) {
    const tag = token.replace(/^#+/u, "").trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function extractCaptureLinks(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>{}\[\]"']+/giu) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of matches) {
    const link = match.replace(/[),.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F]+$/u, "");
    if (!link || seen.has(link)) {
      continue;
    }
    seen.add(link);
    links.push(link);
  }
  return links;
}

/** Keep the modal intentionally small and protect it from duplicate async results. */
export function visibleCaptureCandidates(candidates: CaptureTargetCandidate[]): CaptureTargetCandidate[] {
  const seen = new Set<string>();
  const visible: CaptureTargetCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    visible.push(candidate);
    if (visible.length === 3) {
      break;
    }
  }
  return visible;
}

export function chooseDefaultCaptureCandidate(
  candidates: CaptureTargetCandidate[]
): CaptureTargetCandidate | undefined {
  const first = candidates[0];
  if (first && first.confidence !== "weak") {
    return first;
  }
  return candidates.find((candidate) => candidate.kind === "inbox") ?? first;
}

/** A late rerank may change ordering, but must never replace an explicit user choice. */
export function reconcileCaptureCandidateId(
  candidates: CaptureTargetCandidate[],
  currentId: string,
  manuallySelected: boolean
): string {
  if (manuallySelected && candidates.some((candidate) => candidate.id === currentId)) {
    return currentId;
  }
  return chooseDefaultCaptureCandidate(candidates)?.id ?? "";
}

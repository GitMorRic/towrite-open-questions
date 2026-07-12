import { shortHash } from "../core/hash";

export const MISSING_TARGET_REVISION = "missing";

export function captureContentRevision(content: string): string {
  return `content-${content.length.toString(36)}-${captureIntegrityDigest(content)}`;
}

/** A synchronous 64-bit-style guard built from two independently salted hashes. */
export function captureIntegrityDigest(content: string): string {
  return `${shortHash(`capture-a:${content}`)}${shortHash(`capture-b:${content}`)}`;
}

export function captureFolderRevision(path: string, settingsRevision = "1", stageId = ""): string {
  return `folder-${shortHash(`${normalizeCapturePath(path)}\u0000${settingsRevision}\u0000${stageId}`)}`;
}

export function captureCandidateId(kind: string, action: string, path: string, stageId = ""): string {
  return `capture-target-${shortHash(`${kind}\u0000${action}\u0000${normalizeCapturePath(path)}\u0000${stageId}`)}`;
}

export function normalizeCapturePath(value: string): string {
  return value
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/\/{2,}/gu, "/");
}

export function assertSafeCapturePath(value: string, kind: "file" | "folder"): string {
  const normalized = normalizeCapturePath(value);
  if (!normalized && kind === "file") {
    throw new Error("Capture target file path is empty.");
  }
  if (value.trim().startsWith("/") || /^[A-Za-z]:/u.test(value.trim())) {
    throw new Error("Capture targets must be relative to the vault.");
  }
  if (normalized.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Capture target path cannot contain '.' or '..' segments.");
  }
  if (kind === "file" && !normalized.toLowerCase().endsWith(".md")) {
    throw new Error("Capture target files must be Markdown files.");
  }
  return normalized;
}

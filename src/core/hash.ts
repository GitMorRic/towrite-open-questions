export function shortHash(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

export function slugify(input: string): string {
  return input
    .replace(/\.[^.]+$/u, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 32) || "note";
}

export function makeQuestionId(filePath: string, line: number, text: string): string {
  return `oq_${slugify(filePath.split(/[\\/]/u).pop() ?? filePath)}_${shortHash(`${filePath}:${line}:${text}`)}`;
}

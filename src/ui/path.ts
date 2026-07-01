export function compactPath(path: string, tailSegments = 2): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= tailSegments + 1) {
    return path;
  }
  return `.../${parts.slice(-tailSegments).join("/")}`;
}

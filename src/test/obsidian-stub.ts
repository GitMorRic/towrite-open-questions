export class TFile {
  path = "";
  extension = "md";
  basename = "";
}

export const Platform = {
  isDesktopApp: true
};

export function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
}

export function requestUrl(): never {
  throw new Error("Test must mock obsidian.requestUrl.");
}

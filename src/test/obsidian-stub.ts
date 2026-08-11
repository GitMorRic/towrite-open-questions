import { StateField } from "@codemirror/state";

export const editorLivePreviewField = StateField.define<boolean>({
  create: () => false,
  update: (value) => value
});

export class TFile {
  path = "";
  extension = "md";
  basename = "";
}

export class MarkdownView {
  editor: unknown;
  containerEl: unknown = {
    querySelector: () => null
  };
}

export const Platform = {
  isDesktopApp: true
};

export function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
}

export function resolveSubpath(): null {
  return null;
}

export function requestUrl(): never {
  throw new Error("Test must mock obsidian.requestUrl.");
}

export class TFile {
  path = "";
  extension = "md";
  basename = "";
}

export const Platform = {
  isDesktopApp: true
};

export function requestUrl(): never {
  throw new Error("Test must mock obsidian.requestUrl.");
}

// Production runs inside Obsidian's Electron renderer, where browser globals
// are exposed on `window`. Vitest uses Node so alias the same standards-based
// APIs without changing production code back to marketplace-disallowed globals.
if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis
  });
}

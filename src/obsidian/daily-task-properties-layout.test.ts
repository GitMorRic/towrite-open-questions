import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("task property modal layout contract", () => {
  it("sizes the outer shell and never forces a fixed-width content canvas", () => {
    expect(css).toContain(".modal.towrite-daily-properties-modal-shell");
    expect(css).toMatch(
      /\.towrite-daily-properties-modal\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/su
    );
    expect(css).not.toMatch(
      /\.towrite-daily-properties-modal\s*\{[^}]*width:\s*min\(620px/isu
    );
    expect(css).not.toContain("min-width: min(260px, 48vw)");
  });

  it("switches field rows by modal width and prevents unbroken labels from overflowing", () => {
    expect(css).toContain("@container (max-width: 560px)");
    expect(css).toMatch(
      /\.towrite-daily-properties-grid \.setting-item[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/u
    );
    expect(css).toMatch(
      /\.towrite-daily-properties-header h2\s*\{[^}]*overflow-wrap:\s*anywhere;/su
    );
    expect(css).toMatch(
      /\.modal\.towrite-daily-properties-modal-shell \.modal-content\s*\{[^}]*overflow-x:\s*clip;/su
    );
  });

  it("uses keyboard-accessible progressive disclosure for optional properties", () => {
    expect(css).toContain(".towrite-task-property-section > summary");
    expect(css).toContain(".towrite-task-property-section > summary:focus-visible");
    expect(css).toMatch(
      /\.towrite-task-property-section-body \.setting-item[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/u
    );
    expect(css).not.toContain(".cm-line:hover .towrite-note-task-disclosure-content");
  });
});

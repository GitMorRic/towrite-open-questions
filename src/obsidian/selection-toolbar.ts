import type { OpenQuestionColor, OpenQuestionLane } from "../core/types";

interface SelectionQuestionToolbarOptions {
  onCreate: (lane: OpenQuestionLane, color?: OpenQuestionColor) => void;
}

const COLORS: OpenQuestionColor[] = ["amber", "mint", "sky", "rose", "violet", "slate"];

export class SelectionQuestionToolbar {
  private readonly element: HTMLElement;
  private readonly colorButton: HTMLButtonElement;
  private readonly palette: HTMLElement;
  private readonly document: Document;
  private readonly win: Window;
  private selectedColor: OpenQuestionColor | null = null;
  private paletteOpen = false;
  private readonly handleMouseUp = () => {
    this.win.setTimeout(() => this.positionNearSelection(), 0);
  };
  private readonly handleScroll = () => this.hide();

  constructor(private readonly options: SelectionQuestionToolbarOptions) {
    this.document = activeDocument;
    this.win = this.document.defaultView ?? activeWindow;
    this.element = this.document.body.createDiv({ cls: "towrite-selection-toolbar" });
    const rendered = this.render();
    this.colorButton = rendered.colorButton;
    this.palette = rendered.palette;
    this.hide();
    this.document.addEventListener("mouseup", this.handleMouseUp);
    this.document.addEventListener("keyup", this.handleMouseUp);
    this.document.addEventListener("scroll", this.handleScroll, true);
  }

  destroy(): void {
    this.document.removeEventListener("mouseup", this.handleMouseUp);
    this.document.removeEventListener("keyup", this.handleMouseUp);
    this.document.removeEventListener("scroll", this.handleScroll, true);
    this.element.remove();
  }

  hide(): void {
    this.paletteOpen = false;
    this.resetColor();
    this.palette.removeClass("is-open");
    this.element.removeClass("is-visible");
  }

  private render(): { colorButton: HTMLButtonElement; palette: HTMLElement } {
    const colorWrap = this.element.createDiv({ cls: "towrite-color-picker" });
    const colorButton = colorWrap.createEl("button", {
      cls: "towrite-color-trigger",
      attr: { type: "button", title: "Choose optional marker color" }
    });
    colorButton.createSpan({ cls: "towrite-color-trigger-dot" });
    colorButton.createSpan({ cls: "towrite-color-trigger-label", text: "Color" });
    colorButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.togglePalette();
    });

    const palette = colorWrap.createDiv({ cls: "towrite-color-palette" });
    for (const color of COLORS) {
      const swatch = palette.createEl("button", {
        cls: `towrite-palette-color towrite-color-${color}`,
        attr: { type: "button", title: `Use ${color}` }
      });
      swatch.createSpan({ text: color });
      swatch.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectColor(color);
      });
    }

    this.actionButton("Think", () => {
      this.options.onCreate("think", this.selectedColor ?? undefined);
      this.hide();
    }, "towrite-action-think");
    this.actionButton("Write", () => {
      this.options.onCreate("write", this.selectedColor ?? undefined);
      this.hide();
    }, "towrite-action-write");

    return { colorButton, palette };
  }

  private actionButton(label: string, onClick: () => void, className?: string): void {
    const button = this.element.createEl("button", {
      cls: className,
      text: label,
      attr: { type: "button", title: label }
    });
    button.addEventListener("click", onClick);
  }

  private togglePalette(): void {
    this.paletteOpen = !this.paletteOpen;
    this.palette.toggleClass("is-open", this.paletteOpen);
  }

  private selectColor(color: OpenQuestionColor): void {
    this.selectedColor = color;
    this.paletteOpen = false;
    this.palette.removeClass("is-open");
    for (const nextColor of COLORS) {
      this.colorButton.removeClass(`towrite-color-${nextColor}`);
    }
    this.colorButton.addClass(`towrite-color-${color}`);
  }

  private resetColor(): void {
    this.selectedColor = null;
    for (const color of COLORS) {
      this.colorButton.removeClass(`towrite-color-${color}`);
    }
  }

  private positionNearSelection(): void {
    const selection = this.win.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.hide();
      return;
    }

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const container = ancestor.instanceOf(HTMLElement)
      ? ancestor
      : ancestor.parentElement;

    if (!selectedText || !container?.closest(".markdown-source-view, .markdown-reading-view, .markdown-preview-view, .cm-editor, .pdf-viewer, .pdf-container, .pdf-embed, .pdf-page")) {
      this.hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    this.element.style.left = `${Math.max(10, rect.left + rect.width / 2)}px`;
    this.element.style.top = `${Math.max(10, rect.top - 46)}px`;
    this.element.addClass("is-visible");
  }
}

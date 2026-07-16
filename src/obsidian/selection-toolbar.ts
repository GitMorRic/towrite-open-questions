import type { OpenQuestionColor, OpenQuestionLane } from "../core/types";

interface SelectionQuestionToolbarOptions {
  onCreate: (lane: OpenQuestionLane, color?: OpenQuestionColor) => void;
  onCapture?: (selectedText: string) => void;
}

const COLORS: OpenQuestionColor[] = ["amber", "mint", "sky", "rose", "violet", "slate"];

export class SelectionQuestionToolbar {
  private readonly element: HTMLElement;
  private readonly colorButton: HTMLButtonElement;
  private readonly palette: HTMLElement;
  private readonly doc: Document;
  private readonly win: Window;
  private selectedColor: OpenQuestionColor | null = null;
  private paletteOpen = false;
  private currentSelectedText = "";
  private positionFrame: number | null = null;
  private readonly swatches = new Map<OpenQuestionColor, HTMLButtonElement>();
  private readonly schedulePosition = () => {
    if (this.positionFrame !== null) {
      return;
    }
    this.positionFrame = this.win.requestAnimationFrame(() => {
      this.positionFrame = null;
      this.positionNearSelection();
    });
  };
  private readonly handleScroll = () => this.hide();

  constructor(private readonly options: SelectionQuestionToolbarOptions) {
    this.doc = activeDocument;
    this.win = this.doc.defaultView ?? activeWindow;
    this.element = this.doc.body.createDiv({ cls: "towrite-selection-toolbar" });
    const rendered = this.render();
    this.colorButton = rendered.colorButton;
    this.palette = rendered.palette;
    this.hide();
    this.doc.addEventListener("mouseup", this.schedulePosition);
    this.doc.addEventListener("selectionchange", this.schedulePosition);
    this.doc.addEventListener("scroll", this.handleScroll, true);
  }

  destroy(): void {
    this.doc.removeEventListener("mouseup", this.schedulePosition);
    this.doc.removeEventListener("selectionchange", this.schedulePosition);
    this.doc.removeEventListener("scroll", this.handleScroll, true);
    if (this.positionFrame !== null) {
      this.win.cancelAnimationFrame(this.positionFrame);
      this.positionFrame = null;
    }
    this.element.remove();
  }

  hide(): void {
    if (!this.element.hasClass("is-visible") && !this.paletteOpen && !this.currentSelectedText) {
      return;
    }
    this.paletteOpen = false;
    this.currentSelectedText = "";
    this.resetColor();
    this.palette.removeClass("is-open");
    this.element.removeClass("is-visible");
    this.palette.setAttribute("aria-hidden", "true");
    this.colorButton.setAttribute("aria-expanded", "false");
  }

  private render(): { colorButton: HTMLButtonElement; palette: HTMLElement } {
    const colorWrap = this.element.createDiv({ cls: "towrite-color-picker" });
    const colorButton = colorWrap.createEl("button", {
      cls: "towrite-color-trigger",
      attr: {
        type: "button",
        title: "Choose optional marker color",
        "aria-label": "Choose optional marker color",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-controls": "towrite-selection-color-palette"
      }
    });
    colorButton.createSpan({ cls: "towrite-color-trigger-dot" });
    colorButton.createSpan({ cls: "towrite-color-trigger-label", text: "Color" });
    colorButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.togglePalette();
    });

    const palette = colorWrap.createDiv({
      cls: "towrite-color-palette",
      attr: {
        id: "towrite-selection-color-palette",
        role: "radiogroup",
        "aria-label": "Marker color",
        "aria-hidden": "true"
      }
    });
    for (const [index, color] of COLORS.entries()) {
      const swatch = palette.createEl("button", {
        cls: `towrite-palette-color towrite-color-${color}`,
        attr: {
          type: "button",
          title: `Use ${color}`,
          role: "radio",
          "aria-checked": "false",
          "aria-label": `Use ${color}`
        }
      });
      this.swatches.set(color, swatch);
      swatch.createSpan({ text: color });
      swatch.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectColor(color);
      });
      swatch.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.closePalette(true);
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const next = (index + delta + COLORS.length) % COLORS.length;
        this.swatches.get(COLORS[next])?.focus();
      });
    }

    this.actionButton("ToThink", () => {
      this.options.onCreate("think", this.selectedColor ?? undefined);
      this.hide();
    }, "towrite-action-think");
    this.actionButton("ToWrite", () => {
      this.options.onCreate("write", this.selectedColor ?? undefined);
      this.hide();
    }, "towrite-action-write");
    if (this.options.onCapture) {
      this.actionButton("Capture", () => {
        const selectedText = this.currentSelectedText;
        if (selectedText) {
          this.options.onCapture?.(selectedText);
        }
        this.hide();
      }, "towrite-action-capture");
    }

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
    this.palette.setAttribute("aria-hidden", String(!this.paletteOpen));
    this.colorButton.setAttribute("aria-expanded", String(this.paletteOpen));
    if (this.paletteOpen) {
      this.swatches.get(this.selectedColor ?? COLORS[0])?.focus();
    }
  }

  private closePalette(restoreFocus = false): void {
    this.paletteOpen = false;
    this.palette.removeClass("is-open");
    this.palette.setAttribute("aria-hidden", "true");
    this.colorButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      this.colorButton.focus();
    }
  }

  private selectColor(color: OpenQuestionColor): void {
    this.selectedColor = color;
    this.closePalette(true);
    for (const nextColor of COLORS) {
      this.colorButton.removeClass(`towrite-color-${nextColor}`);
      this.swatches.get(nextColor)?.setAttribute("aria-checked", String(nextColor === color));
    }
    this.colorButton.addClass(`towrite-color-${color}`);
  }

  private resetColor(): void {
    this.selectedColor = null;
    for (const color of COLORS) {
      this.colorButton.removeClass(`towrite-color-${color}`);
      this.swatches.get(color)?.setAttribute("aria-checked", "false");
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
    this.currentSelectedText = selectedText;
    this.element.addClass("is-visible");
    const width = Math.min(this.element.offsetWidth, Math.max(0, this.win.innerWidth - 16));
    const halfWidth = width / 2;
    const desiredCenter = rect.left + rect.width / 2;
    const center = Math.min(
      Math.max(8 + halfWidth, desiredCenter),
      Math.max(8 + halfWidth, this.win.innerWidth - 8 - halfWidth)
    );
    this.element.style.left = `${center}px`;
    this.element.style.top = `${Math.max(10, rect.top - 46)}px`;
  }
}

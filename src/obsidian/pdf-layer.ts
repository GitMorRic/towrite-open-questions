import { TFile, type App, type Component } from "obsidian";
import { buildPdfAnchor } from "../core/pdf-anchor";
import type { OpenQuestion, PdfAnchor } from "../core/types";

interface PdfQuestionLayerOptions {
  app: App;
  component: Component;
  getQuestions(filePath: string): OpenQuestion[];
  subscribe(listener: () => void): () => void;
}

const PDF_PAGE_SELECTOR = ".pdf-page, .page[data-page-number], .page";
const PDF_VIEWER_SELECTOR = ".pdf-container, .pdf-viewer, .pdf-embed, .workspace-leaf-content[data-type='pdf']";

export class PdfQuestionLayer {
  private root?: HTMLElement;
  private observer?: MutationObserver;
  private frame: number | null = null;

  constructor(private readonly options: PdfQuestionLayerOptions) {}

  register(): void {
    this.options.component.registerEvent(this.options.app.workspace.on("active-leaf-change", () => this.scheduleRender()));
    this.options.component.registerEvent(this.options.app.workspace.on("layout-change", () => this.scheduleRender()));
    this.options.component.registerDomEvent(document, "scroll", () => this.scheduleRender(), true);
    this.options.component.registerDomEvent(window, "resize", () => this.scheduleRender());
    this.options.component.register(this.options.subscribe(() => this.scheduleRender()));
    this.observer = new MutationObserver(() => this.scheduleRender());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.options.component.register(() => this.destroy());
    this.scheduleRender();
  }

  destroy(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.observer?.disconnect();
    this.root?.remove();
    this.root = undefined;
  }

  scheduleRender(): void {
    if (this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  private render(): void {
    const file = activePdfFile(this.options.app);
    const viewer = activePdfViewer(this.options.app);
    if (!file || !viewer) {
      this.root?.remove();
      this.root = undefined;
      return;
    }

    const host = viewer.closest<HTMLElement>(".workspace-leaf-content") ?? viewer;
    host.addClass("towrite-pdf-host");

    if (!this.root || this.root.parentElement !== host) {
      this.root?.remove();
      this.root = host.createDiv({ cls: "towrite-pdf-layer" });
    }

    const hostRect = host.getBoundingClientRect();
    this.root.querySelectorAll(".towrite-pdf-highlight").forEach((element) => element.remove());

    for (const question of this.options.getQuestions(file.path)) {
      const anchor = question.source.pdfAnchor;
      if (!anchor || question.status === "ignored") {
        continue;
      }

      for (const rect of anchor.rects) {
        const page = pageElementByNumber(this.options.app, rect.pageNumber);
        if (!page) {
          continue;
        }
        const pageRect = page.getBoundingClientRect();
        const highlight = this.root.createDiv({
          cls: `towrite-pdf-highlight towrite-pdf-highlight-${question.color}`,
          attr: {
            "data-towrite-question-id": question.id,
            title: question.title || question.question
          }
        });
        highlight.style.left = `${pageRect.left - hostRect.left + rect.left * pageRect.width}px`;
        highlight.style.top = `${pageRect.top - hostRect.top + rect.top * pageRect.height}px`;
        highlight.style.width = `${rect.width * pageRect.width}px`;
        highlight.style.height = `${rect.height * pageRect.height}px`;
      }
    }
  }
}

export function pdfAnchorFromCurrentSelection(): PdfAnchor | undefined {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  if (!selection || selection.rangeCount === 0 || !selectedText) {
    return undefined;
  }

  const items = [];
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    for (const rect of Array.from(range.getClientRects())) {
      const page = pageElementFromRect(rect);
      if (!page) {
        continue;
      }
      const pageRect = page.getBoundingClientRect();
      items.push({
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        page: {
          pageNumber: pageNumber(page),
          left: pageRect.left,
          top: pageRect.top,
          width: pageRect.width,
          height: pageRect.height
        }
      });
    }
  }

  return buildPdfAnchor(selectedText, items);
}

export async function jumpToPdfQuestion(app: App, file: TFile, question: OpenQuestion): Promise<boolean> {
  if (file.extension.toLowerCase() !== "pdf") {
    return false;
  }

  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, {
    active: true,
    state: question.source.page ? { page: question.source.page } : undefined,
    eState: question.source.page ? { page: question.source.page } : undefined
  });

  const anchor = question.source.pdfAnchor;
  const pageNumberToFind = anchor?.pageNumber ?? question.source.page;
  if (!pageNumberToFind) {
    return true;
  }

  const page = await waitForPdfPage(app, pageNumberToFind);
  if (!page) {
    return true;
  }

  const firstRect = anchor?.rects.find((rect) => rect.pageNumber === pageNumberToFind);
  scrollPdfPageIntoView(page, firstRect);
  window.setTimeout(() => flashPdfQuestion(question.id), 180);
  return true;
}

function activePdfFile(app: App): TFile | null {
  const file = app.workspace.getActiveFile();
  return file instanceof TFile && file.extension.toLowerCase() === "pdf" ? file : null;
}

function activePdfViewer(app: App): HTMLElement | null {
  const active = (app.workspace.activeLeaf?.view as { containerEl?: HTMLElement } | undefined)?.containerEl;
  const root = active ?? document.querySelector<HTMLElement>(".workspace-leaf.mod-active");
  if (!root) {
    return null;
  }
  return root.matches(PDF_VIEWER_SELECTOR) ? root : root.querySelector<HTMLElement>(PDF_VIEWER_SELECTOR);
}

function pageElementFromRect(rect: DOMRect): HTMLElement | null {
  const element = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return element?.closest<HTMLElement>(PDF_PAGE_SELECTOR) ?? null;
}

function pageElementByNumber(app: App, targetPage: number): HTMLElement | null {
  const viewer = activePdfViewer(app);
  if (!viewer) {
    return null;
  }
  return Array.from(viewer.querySelectorAll<HTMLElement>(PDF_PAGE_SELECTOR))
    .find((page) => pageNumber(page) === targetPage) ?? null;
}

function pageNumber(page: HTMLElement): number {
  const rawPage = page.dataset.pageNumber
    ?? page.getAttribute("data-page-number")
    ?? page.getAttribute("data-page")
    ?? page.getAttribute("aria-label")?.match(/\d+/u)?.[0];
  const parsed = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  const pages = Array.from(page.parentElement?.querySelectorAll<HTMLElement>(PDF_PAGE_SELECTOR) ?? []);
  return Math.max(1, pages.indexOf(page) + 1);
}

async function waitForPdfPage(app: App, targetPage: number): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const page = pageElementByNumber(app, targetPage);
    if (page) {
      return page;
    }
    await sleep(80);
  }
  return null;
}

function scrollPdfPageIntoView(page: HTMLElement, rect?: { top: number; height: number }): void {
  const scroller = scrollParent(page);
  if (!scroller || !rect) {
    page.scrollIntoView({ block: "center" });
    return;
  }

  const pageRect = page.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const targetTop = scroller.scrollTop + pageRect.top - scrollerRect.top + rect.top * pageRect.height;
  scroller.scrollTo({
    top: Math.max(0, targetTop - scroller.clientHeight * 0.35),
    behavior: "smooth"
  });
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/u.test(`${style.overflowY}${style.overflow}`) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function flashPdfQuestion(questionId: string): void {
  const highlights = document.querySelectorAll<HTMLElement>(`.towrite-pdf-highlight[data-towrite-question-id="${CSS.escape(questionId)}"]`);
  for (const highlight of Array.from(highlights)) {
    highlight.addClass("is-flashing");
    window.setTimeout(() => highlight.removeClass("is-flashing"), 1600);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

import { Modal, type App } from "obsidian";
import type { SvelteComponent } from "svelte";
import CaptureModalView from "../ui/CaptureModal.svelte";
import type { CaptureModalProps } from "../ui/capture-modal-types";

export interface CaptureModalOptions extends Omit<CaptureModalProps, "onRequestClose"> {
  onClosed?: () => void;
}

/** Obsidian lifecycle adapter; all capture behavior stays behind the supplied callbacks. */
export class CaptureModal extends Modal {
  private component?: SvelteComponent;
  private busy = false;

  constructor(app: App, private readonly options: CaptureModalOptions) {
    super(app);
    this.shouldRestoreSelection = true;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("towrite-modal", "towrite-capture-modal");
    this.modalEl.addClass("towrite-capture-modal-shell");

    this.component = new CaptureModalView({
      target: this.contentEl,
      props: {
        draft: this.options.draft,
        callbacks: this.options.callbacks,
        context: this.options.context,
        initialCandidates: this.options.initialCandidates ?? [],
        language: this.options.language ?? "en",
        autoFocus: this.options.autoFocus ?? true,
        onRequestClose: () => this.close(),
        onBusyChange: (busy: boolean) => { this.busy = busy; }
      }
    });
  }

  close(): void {
    if (!this.busy) {
      super.close();
    }
  }

  onClose(): void {
    this.component?.$destroy();
    this.component = undefined;
    this.contentEl.empty();
    this.options.onClosed?.();
  }
}

import { Modal, type App } from "obsidian";
import type { SvelteComponent } from "svelte";
import AiAssistantModalView from "../ui/AiAssistantModal.svelte";
import type { AiAssistantModalProps } from "../ui/ai-assistant-types";

export class AiAssistantModal extends Modal {
  private component?: SvelteComponent;
  private busy = false;

  constructor(app: App, private readonly props: Omit<AiAssistantModalProps, "onRequestClose" | "onBusyChange">) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("towrite-modal", "towrite-ai-assistant-modal");
    this.modalEl.addClass("towrite-ai-assistant-modal-shell");
    this.component = new AiAssistantModalView({
      target: this.contentEl,
      props: {
        ...this.props,
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
  }
}

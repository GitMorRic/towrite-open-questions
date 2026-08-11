import { App, Modal, Setting } from "obsidian";

export function confirmWithModal(app: App, message: string, title = "Confirm action"): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmationModal(app, title, message, resolve).open();
  });
}

export function promptWithModal(app: App, title: string, initialValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(app, title, initialValue, resolve).open();
  });
}

class ConfirmationModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly resolveResult: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.title);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText("Confirm")
          .setCta()
          .onClick(() => this.finish(true));
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.finish(false, false);
  }

  private finish(value: boolean, close = true): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(value);
    if (close) this.close();
  }
}

class TextPromptModal extends Modal {
  private value: string;
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    initialValue: string,
    private readonly resolveResult: (value: string | null) => void
  ) {
    super(app);
    this.value = initialValue;
  }

  onOpen(): void {
    this.setTitle(this.title);
    new Setting(this.contentEl)
      .setName(this.title)
      .addText((text) => {
        text.setValue(this.value).onChange((value) => {
          this.value = value;
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(null)))
      .addButton((button) => button.setButtonText("Save").setCta().onClick(() => this.finish(this.value)));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.finish(null, false);
  }

  private finish(value: string | null, close = true): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(value);
    if (close) this.close();
  }
}

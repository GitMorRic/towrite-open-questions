import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const questionCard = readFileSync(new URL("./QuestionCard.svelte", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./SidebarView.svelte", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const selection = readFileSync(new URL("../capture-bridge/selection.ts", import.meta.url), "utf8");

describe("small-screen UI feedback wiring", () => {
  it("does not hide local screen controls behind Device Hub and surfaces send failures", () => {
    expect(questionCard).not.toContain("{#if api.getDeviceHubState() && isMarkdownSource");
    expect(questionCard).toContain("canManuallySendDeviceLibraryEntry(deviceLibraryEntry)");
    expect(questionCard).toContain("disabled={hubSending || !canManuallySendDeviceLibraryEntry(deviceLibraryEntry)}");
    expect(questionCard).not.toContain("disabled={hubSending || !deviceLibraryEntry?.eligible}");
    expect(questionCard).toContain("deviceSendError = error instanceof Error ? error.message : String(error);");
    expect(questionCard).toContain('class="towrite-ai-error" role="alert"');
  });

  it("awaits local-current persistence before optional Hub delivery", () => {
    const method = main.slice(
      main.indexOf("private async sendLocalCandidateToDeviceHub"),
      main.indexOf("private localScreenSelectionNotice")
    );
    const selectIndex = method.indexOf("await this.localTapSelection.selectLocal(localId);");
    const hubIndex = method.indexOf("if (!this.deviceHub.isConfigured())");
    const callback = main.slice(
      main.indexOf("onStateChanged: async () =>"),
      main.indexOf("this.localTapSelection.restore")
    );
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(hubIndex).toBeGreaterThan(selectIndex);
    expect(selection).toContain("await this.options.onStateChanged?.();");
    expect(callback).toContain("await this.savePluginData();");
  });

  it("refreshes the lightweight status only, rather than reloading the Vault surface every five seconds", () => {
    expect(sidebar).toContain("window.setInterval(refreshSmallScreenStatus, 5_000)");
    expect(sidebar).not.toContain('class="towrite-device-status-card" aria-live="polite"');
    const refreshMethod = sidebar.slice(
      sidebar.indexOf("function refreshSmallScreenStatus()"),
      sidebar.indexOf("function localConnectionLabel")
    );
    expect(refreshMethod).toContain("smallScreenStatus = api.getSmallScreenConnectionStatus();");
    expect(refreshMethod).not.toContain("reload()");
    expect(refreshMethod).not.toContain("getQuestions");
    expect(refreshMethod).not.toContain("getWorkflowPayload");
  });
});

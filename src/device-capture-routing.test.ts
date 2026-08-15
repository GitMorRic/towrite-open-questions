import { describe, expect, it } from "vitest";
import {
  buildDeviceCaptureRoutingPreview,
  normalizeDeviceAgentProposals
} from "./device-capture-routing";

describe("device capture routing", () => {
  it("previews note, todo, and approval-gated Agent routes without writing", () => {
    const preview = buildDeviceCaptureRoutingPreview({
      captureId: "capture_a",
      text: "整理采访记录",
      tags: [],
      category: "创作",
      metadata: { source_file: "Projects/Book.md" }
    }, { taskPoolPath: "Planning/Task Pool.md", agentAvailable: true });
    expect(preview.routes.map((route) => route.kind)).toEqual([
      "append_note",
      "create_todo",
      "agent_request"
    ]);
    expect(preview.routes.every((route) => route.requiresApproval)).toBe(true);
    expect(preview.routes[1].description).toContain("创作");
  });

  it("drops malformed persisted Agent runs", () => {
    expect(normalizeDeviceAgentProposals([{ runId: "unsafe", tool: "shell" }])).toEqual([]);
  });
});

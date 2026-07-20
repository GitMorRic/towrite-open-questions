import { describe, expect, it } from "vitest";
import {
  buildQuestionCaptureActivity,
  hasValidQuestionCaptureActivityIntegrity,
  isMatchingQuestionCaptureActivity
} from ".";

describe("NFC question answer activity", () => {
  it("builds a bounded activity with a durable link and supports idempotent matching", () => {
    const activity = buildQuestionCaptureActivity({
      captureId: "cap_answer",
      questionId: "question_one",
      body: "a".repeat(10_000),
      finalPath: "Projects/Novel.md"
    });
    expect(activity.text).toHaveLength(4000);
    expect(activity.text).toMatch(/Saved to \[\[Projects\/Novel\]\]$/u);
    const note = {
      text: activity.text,
      metadata: { capture_id: "cap_answer", activity_digest: activity.digest }
    };
    expect(isMatchingQuestionCaptureActivity(note, "cap_answer", activity)).toBe(true);
    expect(hasValidQuestionCaptureActivityIntegrity(note, "cap_answer", "question_one")).toBe(true);
  });

  it("fails the composite undo guard when activity text or digest changes", () => {
    const activity = buildQuestionCaptureActivity({
      captureId: "cap_answer",
      questionId: "question_one",
      body: "Original answer",
      finalPath: "Projects/Novel.md"
    });
    expect(hasValidQuestionCaptureActivityIntegrity({
      text: `${activity.text} edited`,
      metadata: { capture_id: "cap_answer", activity_digest: activity.digest }
    }, "cap_answer", "question_one")).toBe(false);
    expect(isMatchingQuestionCaptureActivity({
      text: activity.text,
      metadata: { capture_id: "cap_answer", activity_digest: "wrong" }
    }, "cap_answer", activity)).toBe(false);
  });
});

import type { OpenQuestionLane } from "../core/types";

export type SidebarLaneFilter = "all" | OpenQuestionLane | "inbox";

/** Count the two task surfaces shown by the All tab. */
export function allSurfaceCount(questionCount: number, inboxCount: number): number {
  return Math.max(0, questionCount) + Math.max(0, inboxCount);
}

export function shouldRenderInboxPreview(lane: SidebarLaneFilter, inboxCount: number): boolean {
  return lane === "all" && inboxCount > 0;
}

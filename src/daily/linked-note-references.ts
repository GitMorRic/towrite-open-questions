import { contentHash128 } from "../core/hash";
import type {
  DailyMarkdownTarget,
  DailyPlanHierarchy
} from "./types";

/**
 * A stable projection edge from a Daily list row to a linked Markdown note.
 * The linked note remains the only owner of its internal checkbox state.
 */
export interface DailyLinkedNoteReference {
  id: string;
  parentId: string;
  parentTitle: string;
  sourcePath: string;
  line: number;
  target: DailyMarkdownTarget;
  revision: string;
}

export function collectDailyLinkedNoteReferences(
  hierarchy: DailyPlanHierarchy
): DailyLinkedNoteReference[] {
  const references: DailyLinkedNoteReference[] = [];
  for (const group of hierarchy.groups) {
    for (const target of group.links) {
      references.push(createReference({
        hierarchy,
        parentId: group.id,
        parentTitle: group.text,
        line: group.line,
        raw: group.rawLine ?? group.text,
        target
      }));
    }
  }
  for (const task of hierarchy.tasks) {
    for (const target of task.links) {
      references.push(createReference({
        hierarchy,
        parentId: task.blockId ?? `daily_link_${contentHash128(`${hierarchy.sourcePath}\n${task.line}\n${task.rawLine}`)}`,
        parentTitle: task.text,
        line: task.line,
        raw: task.rawLine,
        target
      }));
    }
  }
  return [...new Map(references.map((reference) => [
    `${reference.parentId}\u0000${reference.target.linkText}\u0000${reference.target.heading ?? ""}\u0000${reference.target.blockId ?? ""}`,
    reference
  ])).values()];
}

function createReference(input: {
  hierarchy: DailyPlanHierarchy;
  parentId: string;
  parentTitle: string;
  line: number;
  raw: string;
  target: DailyMarkdownTarget;
}): DailyLinkedNoteReference {
  const revision = `dln_${contentHash128([
    input.hierarchy.revision,
    input.parentId,
    input.raw,
    input.target.raw
  ].join("\n"))}`;
  return {
    id: `daily_note_${contentHash128(`${input.hierarchy.sourcePath}\n${input.line}\n${input.target.raw}`)}`,
    parentId: input.parentId,
    parentTitle: input.parentTitle,
    sourcePath: input.hierarchy.sourcePath,
    line: input.line,
    target: { ...input.target },
    revision
  };
}

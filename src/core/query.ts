import type { ArticleSummary, OpenQuestion, OpenQuestionQuery } from "./types";

export function queryQuestions(
  questions: OpenQuestion[],
  query: OpenQuestionQuery = {}
): OpenQuestion[] {
  const search = query.search?.trim().toLowerCase();

  let result = questions.filter((question) => {
    if (query.filePath && question.source.file !== query.filePath) {
      return false;
    }

    if (query.folderPath && !question.source.file.startsWith(query.folderPath.replace(/\/?$/u, "/"))) {
      return false;
    }

    if (query.status && !query.status.includes(question.status)) {
      return false;
    }

    if (query.kind && !query.kind.includes(question.kind)) {
      return false;
    }

    if (query.lane && !query.lane.includes(question.lane)) {
      return false;
    }

    if (search) {
      const haystack = [
        question.question,
        question.title,
        (question.tags ?? []).join(" "),
        question.lane,
        question.anchorText,
        question.contextSummary,
        question.note,
        question.notes?.map((note) => note.text).join(" "),
        question.kind,
        question.status,
        question.source.file,
        question.source.headingPath.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    }

    return true;
  });

  result = sortQuestions(result);

  if (query.limit && query.limit > 0) {
    return result.slice(0, query.limit);
  }

  return result;
}

export function buildArticleSummaries(questions: OpenQuestion[]): ArticleSummary[] {
  const byFile = new Map<string, OpenQuestion[]>();

  for (const question of questions) {
    const existing = byFile.get(question.source.file) ?? [];
    existing.push(question);
    byFile.set(question.source.file, existing);
  }

  return Array.from(byFile.entries())
    .map(([filePath, fileQuestions]) => {
      const open = fileQuestions.filter((question) => isWorkStatus(question.status)).length;
      const candidate = fileQuestions.filter((question) => question.status === "candidate").length;
      const resolved = fileQuestions.filter((question) => question.status === "resolved").length;
      const ignored = fileQuestions.filter((question) => question.status === "ignored").length;
      const think = fileQuestions.filter((question) => question.lane === "think").length;
      const write = fileQuestions.filter((question) => question.lane === "write").length;

      return {
        filePath,
        title: titleFromPath(filePath),
        open,
        candidate,
        resolved,
        ignored,
        think,
        write,
        needsWork: open > 0,
        topIssues: sortQuestions(
          fileQuestions.filter((question) => isWorkStatus(question.status) || question.status === "candidate")
        ).slice(0, 5)
      };
    })
    .sort((left, right) => right.open - left.open || right.candidate - left.candidate || left.title.localeCompare(right.title));
}

export function sortQuestions(questions: OpenQuestion[]): OpenQuestion[] {
  const statusWeight = {
    open: 0,
    blocked: 0,
    paused: 1,
    candidate: 1,
    resolved: 2,
    ignored: 3
  } as Record<string, number>;
  const priorityWeight = {
    P1: 0,
    P2: 1,
    P3: 2
  };

  return [...questions].sort((left, right) => {
    const byStatus = (statusWeight[left.status] ?? 1) - (statusWeight[right.status] ?? 1);
    if (byStatus !== 0) {
      return byStatus;
    }

    const byPriority = (left.priority ? priorityWeight[left.priority] : 9) - (right.priority ? priorityWeight[right.priority] : 9);
    if (byPriority !== 0) {
      return byPriority;
    }

    return left.source.file.localeCompare(right.source.file) || left.source.lineStart - right.source.lineStart;
  });
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function titleFromPath(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.md$/iu, "") ?? filePath;
}

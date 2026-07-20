import { captureIntegrityDigest } from "../capture";

export interface QuestionCaptureActivity {
  text: string;
  digest: string;
}

export interface QuestionCaptureActivityNote {
  text: string;
  metadata?: Record<string, string>;
}

export function buildQuestionCaptureActivity(input: {
  captureId: string;
  questionId: string;
  body: string;
  finalPath: string;
}): QuestionCaptureActivity {
  const link = `\n\nSaved to [[${input.finalPath.replace(/\.md$/iu, "")}]]`;
  const text = `${input.body.slice(0, Math.max(0, 4000 - link.length))}${link}`;
  return {
    text,
    digest: questionCaptureActivityDigest(input.captureId, input.questionId, text)
  };
}

export function isMatchingQuestionCaptureActivity(
  note: QuestionCaptureActivityNote,
  captureId: string,
  expected: QuestionCaptureActivity
): boolean {
  return note.metadata?.capture_id === captureId
    && note.metadata?.activity_digest === expected.digest
    && note.text === expected.text;
}

export function hasValidQuestionCaptureActivityIntegrity(
  note: QuestionCaptureActivityNote,
  captureId: string,
  questionId: string
): boolean {
  return note.metadata?.capture_id === captureId
    && note.metadata?.activity_digest === questionCaptureActivityDigest(captureId, questionId, note.text);
}

export function questionCaptureActivityDigest(captureId: string, questionId: string, text: string): string {
  return captureIntegrityDigest(`${captureId}\u0000${questionId}\u0000${text}`);
}

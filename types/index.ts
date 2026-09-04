export enum CandidateStatus {
  REGISTERED = "REGISTERED",
  JOINED = "JOINED",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  DISQUALIFIED = "DISQUALIFIED",
}

export enum QuestionType {
  MCQ = "mcq",
  PSYCHOMETRIC = "psychometric",
  RATING = "rating",
  IMAGE = "image",
  SHORT_ANSWER = "short_answer",
  LONG_ANSWER = "long_answer",
  TRUE_FALSE = "true_false",
  MULTI_SELECT = "multi_select",
}

// Question types that carry an `options` array + `correctOption` and are
// auto-scored right/wrong — as opposed to psychometric/rating (always full
// points) or short/long answer (manually graded later). This is the single
// source of truth for "does this type participate in scoring, answer-
// shuffling, and the option-based analytics (P-value, discrimination index,
// option frequency)" — every call site should check this instead of
// re-listing the type set, so a future option-based type only needs to be
// added here once.
export function isOptionBasedQuestionType(type: string): boolean {
  return (
    type === QuestionType.MCQ ||
    type === QuestionType.IMAGE ||
    type === QuestionType.TRUE_FALSE ||
    type === QuestionType.MULTI_SELECT
  );
}

// Sanitized question shape sent to the candidate client.
// correctOption/correctOptions must never appear here — only the COUNT of
// correct options for multi-select (correctCount), never which ones.
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: (string | number)[];
  wordLimit: number | null;
  correctCount: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}

// What the candidate's client sends to submit-answer.
// value is null when the timer expired and the question was skipped; a
// string for short_answer/long_answer questions, a number[] of selected
// display-indices for multi_select, a number (option index or mood/rating
// value) for every other type.
export interface AnswerPayload {
  questionId: string;
  value: number | number[] | string | null;
  responseTimeMs: number;
}

export const SocketEvents = {
  CANDIDATE_JOIN: "candidate:join",
  TAB_SWITCH: "tab:switch",
  PAGE_REFRESH: "page:refresh",
  ADMIN_JOIN: "admin:join",
  SESSION_START: "session:start",
  SESSION_END: "session:end",
  ADMIN_DISQUALIFY: "admin:disqualify",
  WARNING: "warning",
  DISQUALIFIED: "disqualified",
  CANDIDATE_EVENT: "candidate:event",
  STATS_UPDATE: "stats:update",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
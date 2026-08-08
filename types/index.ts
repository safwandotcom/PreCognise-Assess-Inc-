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
}

// Sanitized question shape sent to the candidate client.
// correctOption must never appear here.
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: (string | number)[];
  wordLimit: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}

// What the candidate's client sends to submit-answer.
// value is null when the timer expired and the question was skipped; a
// string for short_answer/long_answer questions, a number (option index or
// mood/rating value) for every other type.
export interface AnswerPayload {
  questionId: string;
  value: number | string | null;
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
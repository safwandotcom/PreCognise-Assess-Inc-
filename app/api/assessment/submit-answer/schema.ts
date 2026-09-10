import { z } from "zod";

// Same shape as AnswerPayload.value in types/index.ts — number for MCQ,
// number[] for multi_select, string for short/long answer, null for
// "no answer given". Not required: the original code allowed it undefined.
export const submitAnswerSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.number(), z.array(z.number()), z.string(), z.null()]).optional(),
  responseTimeMs: z.number(),
});

import { z } from "zod";
import { nonBlankString } from "@/lib/validate-body";

// joinToken is looked up against the DB raw (no trim) in route.ts — keep
// it unmodified, only presence-checked.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1),
  joinToken: nonBlankString,
});

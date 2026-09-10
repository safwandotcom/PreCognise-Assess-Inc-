import { z } from "zod";
import { nonBlankString } from "@/lib/validate-body";

// joinToken/code/newPassword use nonBlankString (not trimmed): in route.ts,
// joinToken is compared raw against the DB, code is bcrypt-compared raw,
// and newPassword's raw length/value is what actually gets hashed.
export const verifyOtpSchema = z.object({
  email: z.string().trim().min(1),
  joinToken: nonBlankString,
  code: nonBlankString,
  newPassword: nonBlankString,
});

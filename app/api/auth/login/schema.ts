import { z } from "zod";
import { nonBlankString } from "@/lib/validate-body";

// Two shapes, picked by `mode` in route.ts — anything other than "open" is
// treated as an accessId login, matching this route's original `mode ===
// "open" ? ... : ...` branch (the real accessId-login client never sends
// `mode` at all). joinToken is validated but not trimmed: it's looked up
// against the DB raw both here and in the open-join branch. accessId is
// trimmed (already re-trimmed before every downstream use); password is
// not (bcrypt-compared raw). consent is left untyped — the specific
// PIPEDA "you must agree" check in route.ts needs to see exactly what was
// sent, not a coerced boolean.
export const openLoginSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  joinToken: nonBlankString.optional(),
  consent: z.unknown().optional(),
});

export const accessIdLoginSchema = z.object({
  accessId: z.string().trim().min(1),
  password: nonBlankString,
  joinToken: nonBlankString.optional(),
});

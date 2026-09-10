import { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";

/**
 * A string that must be non-blank once trimmed, but is returned exactly as
 * received (not trimmed). Use this instead of `z.string().trim().min(1)`
 * for fields a route later re-uses verbatim in a security-sensitive
 * comparison or lookup (password hashes, OTP codes, tokens) — several
 * routes here trim only for the presence check but compare the raw value.
 */
export const nonBlankString = z.string().refine((v) => v.trim().length > 0, {
  message: "must not be blank",
});

/**
 * Parses a request body against a Zod schema, returning either the typed
 * data or a ready-to-return 400 NextResponse.
 *
 * `invalidMessage` becomes the body of that response — pass the same
 * message the route already returned for a missing/malformed body, so this
 * is a drop-in replacement for ad hoc `?.trim()` / typeof checks, not a
 * change in what clients see on a bad request.
 */
export async function parseBody<T>(
  schema: ZodType<T>,
  req: NextRequest,
  invalidMessage: string,
): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: NextResponse.json({ error: invalidMessage }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return { error: NextResponse.json({ error: invalidMessage }, { status: 400 }) };
  }

  return { data: result.data };
}

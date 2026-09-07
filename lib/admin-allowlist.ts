// Defense-in-depth for #49 ("no public admin sign-up path, ever"). Clerk's
// own instance-level restriction (Dashboard → User & Authentication →
// Restrictions) is the primary control — this is a second, code-level gate
// so a stray self-signed-up Clerk account still can't do anything here even
// if that Clerk setting were ever left open by mistake.
//
// Reads a comma-separated ADMIN_ALLOWED_EMAILS. An unset/empty list means
// "not yet configured" and allows everyone through — failing closed here
// would lock out every existing admin, including whoever is setting this
// up, the moment this ships. Set the env var to actually turn the gate on.
export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  const allowlist = (process.env.ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return true;
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

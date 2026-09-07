import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);
// No /admin/sign-up route exists — admin accounts are staff-provisioned
// only, via Clerk directly (#49). Only the sign-in and SSO callback paths
// need to stay reachable without a session.
const isAdminAuthRoute = createRouteMatcher([
  "/admin/sign-in(.*)",
  "/admin/sso-callback(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req) && !isAdminAuthRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/(api|trpc)(.*)", "/__clerk/:path*", "/((?!_next|.*\\..*).*)"],
};

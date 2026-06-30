# Neon DB Connection & Clerk Auth Setup

## Connecting a new Neon project

The app uses two connection strings (see `prisma/schema.prisma`):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection (`-pooler` host) — used by the app at runtime, serverless-safe |
| `DIRECT_URL` | Direct connection (no `-pooler`) — required by Prisma for migrations/DDL |

To point the project at a new Neon database:

1. Copy the pooled connection string from the Neon dashboard into `DATABASE_URL` in `.env`.
2. Derive `DIRECT_URL` by removing `-pooler` from the host segment of the same string.
3. Apply the existing migration history:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
4. If the target database is empty, seed the singleton config rows:
   ```bash
   npx prisma db seed
   ```

### Known migration history issue

`20260625142710_add_campaign_completion_message` duplicates a column (`Campaign.completionMessage`) already added by the earlier `20260625000004_campaign_completion_message` migration. On a fresh database, `prisma migrate deploy` will fail on this migration with a "column already exists" error. Resolve it as applied (the column is already present from the earlier migration) and re-run:

```bash
npx prisma migrate resolve --applied 20260625142710_add_campaign_completion_message
npx prisma migrate deploy
```

## Clerk admin auth

Admin auth is handled by `clerkMiddleware` (`middleware.ts`), which protects `/admin(.*)` and `/api/admin(.*)`, excluding the sign-in/sign-up/sso-callback routes.

`ClerkProvider` must be mounted inside `<body>`, not wrapping `<html>`, per Clerk's current Next.js App Router guidance:

```tsx
// app/layout.tsx
return (
  <html lang="en">
    <body>
      <ClerkProvider>{children}</ClerkProvider>
    </body>
  </html>
);
```

The Next.js proxy matcher in `middleware.ts` must include `'/__clerk/:path*'` after the API/TRPC matcher:

```ts
matcher: ["/(api|trpc)(.*)", "/__clerk/:path*", "/((?!_next|.*\\..*).*)"],
```

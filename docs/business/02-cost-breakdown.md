# Cost Breakdown — Infrastructure & Operations
### PreCognise Assessment Platform

---

## Current State (Development / Pre-Revenue)

The platform is fully functional and deployed. Current monthly infrastructure cost is essentially zero because every component is on a free tier.

| Service | Current Plan | Cost |
|---------|-------------|------|
| Vercel (Next.js hosting) | Hobby (free) | $0 |
| Neon (PostgreSQL) | Free tier (0.5 GB, shared compute) | $0 |
| Railway (Socket.IO server) | Starter ($5 credit included) | $0–5 |
| Railway (Redis) | Included in Railway plan | $0 |
| Clerk (Admin auth) | Free (up to 10,000 MAUs) | $0 |
| Resend (Email) | Free (3,000 emails/month) | $0 |
| Domain name | ~$12/year | $1 |
| **Total** | | **~$1–6/month** |

This is enough to run the platform for demos, pilot testing, and onboarding early clients. It will not survive a live 15,000-candidate exam on free tiers.

---

## Capacity Boundaries of Free Tiers

| Service | Free Limit | What Breaks at 15k Candidates |
|---------|-----------|-------------------------------|
| Vercel Hobby | 100 GB-hours serverless, ~100k invocations/day | 15k candidates × 60 API calls = 900k invocations in 2 hours |
| Neon Free | 0.5 GB storage, 0.25 vCPU shared | Connection spikes during login burst; compute throttle |
| Railway Free | 500MB RAM, $5 credit | Socket server runs out of memory at ~2,000 concurrent connections |
| Resend Free | 3,000 emails/month | 15,000 credentials = 5× the limit immediately |
| Clerk Free | 10,000 MAUs | Admin-only auth; 5 admins = fine |

---

## Production Cost: Single Client, 15,000 Candidates

**Assumptions:**
- 2 exam sessions per month
- ~15,000 candidates per session
- Each candidate: ~60 API calls during exam (next-question, submit-answer, polling × 10)
- Exam duration: ~60–90 minutes
- Peak concurrent: 12,000–15,000 (not all join at the exact same second)

---

### Vercel (Next.js — API + Frontend)

| Item | Calculation | Cost |
|------|-------------|------|
| Pro plan (base) | Flat | $20/month |
| Function invocations | 15k × 60 calls × 2 sessions = 1.8M; Pro includes 1M, extra 800k @ $2/M | $1.60 |
| Bandwidth | 15k × ~50KB per page load × 2 = 1.5 GB; 100 GB included | $0 |
| **Subtotal** | | **~$22/month** |

> Note: Redis caching reduces the actual DB-touching invocations dramatically. Most `session-stats` calls hit Redis, not the database. The 60-call estimate covers the full candidate lifecycle.

---

### Neon (PostgreSQL)

| Item | Calculation | Cost |
|------|-------------|------|
| Scale plan base | Flat | $19/month |
| Storage | 15k candidates × 2 sessions × 50 responses = 1.5M rows ≈ 1–2 GB | $0 (included) |
| Compute (burst) | Login burst: 15k logins over ~5 min; exam: sustained query load | ~$15–30 |
| **Subtotal** | | **~$34–49/month** |

---

### Railway — Socket.IO Server

| Item | Calculation | Cost |
|------|-------------|------|
| Socket server (2 replicas) | 2 × 512MB RAM, 0.5 vCPU each × 24h × 30 days | ~$20–35/month |
| Redis instance | 256MB (15k candidate state + broadcast cache + session cache) | ~$10–15/month |
| **Subtotal** | | **~$30–50/month** |

> Redis holds: per-candidate hash (candidateId → socketId + status), session-stats cache (one key per campaign), broadcast cache. 15,000 candidate entries at ~200 bytes each = 3 MB. Trivial.

---

### Resend (Email)

| Item | Calculation | Cost |
|------|-------------|------|
| Pro plan | Up to 50,000 emails/month | $20/month |
| Volume (2 sessions × 15k candidates) | 30,000 credential emails | Within plan |
| **Subtotal** | | **$20/month** |

---

### Clerk (Admin Authentication)

| Item | Notes | Cost |
|------|-------|------|
| Free tier | Candidates use JWT (not Clerk). Admins: 3–5 accounts. Well within 10k MAU limit. | $0/month |

---

### Domain & SSL

| Item | Cost |
|------|------|
| Domain (e.g., precognise.ai) | $1–2/month ($12–20/year) |
| SSL | Free via Vercel | $0 |

---

### Summary: Production Cost for One Client (15k candidates, 2 sessions/month)

| Service | Monthly Cost |
|---------|-------------|
| Vercel | $22 |
| Neon PostgreSQL | $34–49 |
| Railway (Socket + Redis) | $30–50 |
| Resend | $20 |
| Clerk | $0 |
| Domain | $1 |
| **Total** | **$107–142/month** |

**Round number: $150/month** (with 5–10% buffer for usage spikes)

---

## Scaling Beyond One Client

The current architecture is **single-tenant** — one database, one socket server, one deployment. This is fine for one client. For multiple clients, you have two options:

### Option A: One Deployment Per Client (Current Model)
Each client gets their own Vercel + Neon + Railway stack.

| Clients | Monthly Infrastructure | Per Client |
|---------|----------------------|------------|
| 1 | $150 | $150 |
| 5 | $750 | $150 |
| 10 | $1,500 | $150 |
| 25 | $3,750 | $150 |

Pros: Complete data isolation, simple operations, clients can't affect each other.
Cons: Linear cost growth.

### Option B: Multi-Tenant Architecture (Future — Requires Development)
One shared database with organisation-scoped data, one shared socket server with organisation rooms, one deployment.

| Clients | Monthly Infrastructure | Per Client |
|---------|----------------------|------------|
| 5 | $400 | $80 |
| 10 | $600 | $60 |
| 25 | $1,200 | $48 |
| 50 | $2,500 | $50 |

Development cost to reach multi-tenant: ~60–80 hours of engineering work.

---

## Cost Per Candidate (Unit Economics)

| Scenario | Monthly Cost | Sessions/Month | Candidates/Session | Cost per Candidate |
|----------|-------------|----------------|--------------------|--------------------|
| 1 client, 2 sessions × 15k | $150 | 2 | 15,000 | **$0.005** |
| 5 clients, 10 sessions total × 15k | $750 | 10 | 15,000 | **$0.005** |
| 1 client, 1 small session × 500 | $120 | 1 | 500 | **$0.24** |

At 15k scale, the infrastructure cost per candidate is effectively **half a cent.** The value you charge is entirely in IP, reliability, and service — not compute.

---

## What It Would Cost to Build This From Scratch

For context on the value embedded in the existing codebase:

| Component | Estimated Dev Hours | At $80/hr |
|-----------|--------------------|-----------| 
| Campaign management + admin UI | 80h | $6,400 |
| Candidate onboarding (CSV import, email, auth) | 40h | $3,200 |
| Anti-cheat system (socket, tab detection, disqualification) | 60h | $4,800 |
| Exam engine (question delivery, scoring, timer) | 50h | $4,000 |
| Real-time socket server (Railway deploy, Redis adapter) | 40h | $3,200 |
| Analytics dashboard | 40h | $3,200 |
| Branding + white-label system | 20h | $1,600 |
| Waiting room + scale optimisation (Redis caching) | 20h | $1,600 |
| Password reset, OTP, security hardening | 20h | $1,600 |
| Deployment, CI, infra setup | 15h | $1,200 |
| **Total** | **~385 hours** | **~$30,800** |

This is the floor on what the codebase represents in labour value. A competitor buying similar capabilities off the shelf (Mettl, SHL, HackerRank enterprise) would pay $3,000–$15,000/year per client, with far less control.

---

## Hidden Costs to Budget For

| Item | Frequency | Estimated Cost |
|------|-----------|---------------|
| Engineer maintenance (bugs, updates) | Ongoing | $500–2,000/month (part-time) |
| Customer support (onboarding, test setup) | Per client | $100–300 one-time |
| Load testing before large exams | Per large event | $0 (k6 script already exists in codebase) |
| Backup & disaster recovery | Monthly check | $0 (Neon auto-backup included) |
| Security audit | Annual | $1,000–5,000 (optional but recommended) |
| Multi-tenancy development | One-time | $5,000–8,000 at $80/hr |

---

## Break-Even Analysis

If you charge **$1,500/month per client:**

| Clients | Revenue | Infrastructure | Gross Profit | Margin |
|---------|---------|----------------|-------------|--------|
| 1 | $1,500 | $150 | $1,350 | 90% |
| 5 | $7,500 | $750 | $6,750 | 90% |
| 10 | $15,000 | $1,500 | $13,500 | 90% |

Gross margin stays at 90% with the current per-deployment model. The business is infrastructure-light by design.

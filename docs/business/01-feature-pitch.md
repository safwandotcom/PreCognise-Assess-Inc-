# PreCognise — What You're Actually Getting
### A platform built for mass hiring at bank scale. Not adapted from something else.

---

## The Honest Starting Point

Most assessment tools were built for 50–200 candidates in a single room. They bolt on "concurrent user support" later, and it shows — servers crash, timers drift, candidates get the wrong questions, and the anti-cheat is just a checkbox in a settings panel.

PreCognise was architected from day one around a single constraint: **15,000 people sitting the same exam at the exact same moment.** Everything else — every design decision, every tradeoff — follows from that.

---

## Core Capabilities

### 1. Real-Time Proctoring That Actually Works

Most platforms log a tab switch. We act on it.

The moment a candidate switches away from the exam window, a WebSocket event fires to our server. First offence: the candidate sees a warning modal and is forced back into the exam. Second offence: they are **automatically disqualified** with the reason recorded — before they've even had a chance to look something up. The admin sees this happen live on their dashboard.

This is not HTTP polling. There is no 30-second lag. The disqualification is instant, bidirectional, and crosses server replicas because the real-time layer runs on Redis Pub/Sub. If we scale to five servers tomorrow, every candidate is still protected.

**What else is blocked in the exam window:**
- Screenshot via PrintScreen / Mac keyboard shortcuts
- Copy and paste (both directions)
- Right-click context menu
- Browser developer tools (keyboard shortcut interception)
- Full-screen exit (configurable — candidate must stay fullscreen)
- Page refresh (immediate disqualification)

Every single one of these is configurable per campaign. You can have a strict proctored exam and a relaxed skills screen on the same platform.

---

### 2. Single-Device Enforcement with No Race Conditions

If a candidate tries to log in from two devices simultaneously, we don't just show an error. The system uses an **atomic database update** that acts like a database lock — the second login attempt physically cannot succeed even if both happen in the same millisecond. There's no window where two sessions can coexist.

Admin chooses the policy:
- **Mode A:** Disqualify both sessions (treats simultaneous login as a cheating attempt)
- **Mode B:** Reject the second device silently (lets the original session continue)

This is the level of correctness that matters when 15,000 people are trying to log in at 9:00 AM sharp.

---

### 3. Scoring That Rewards What You Care About

Standard assessments give you right/wrong. We give you a richer signal.

**Speed Bonus Scoring:** Each question has a base score and an optional speed bonus. The faster a candidate answers correctly, the more bonus they earn — up to a configurable cap. This surfaces candidates who know the material cold versus candidates who looked it up.

**Psychometric & Rating Questions:** Non-scored questions that always award their base points. These appear in the exam flow naturally and candidates can't tell them apart from scored questions. Useful for personality profiling, culture fit, and behavioral assessments — all in the same sitting.

**Negative Marking:** Only wrong answers are penalised. Skipped questions lose nothing. The deduction multiplier is configurable per campaign. The floor is zero (candidates can't go negative).

**Percentile Ranking:** After the exam ends, each candidate's score is automatically ranked against everyone else who completed that session. No manual calculation.

**Discrimination Index:** For each question, we compute which percentage of top-half scorers got it right versus bottom-half scorers. A question with a high discrimination index separates strong candidates from weak ones. A low index means the question isn't doing useful work. This is the standard psychometric quality metric — most platforms don't surface it at all.

---

### 4. Analytics That Tell You What Happened

The analytics endpoint computes, per campaign:

| Metric | What it tells you |
|--------|------------------|
| Mean / Median / Std Dev score | Distribution shape — is the test too easy? |
| P25 / P75 | Middle 50% performance band |
| Pass rate (configurable threshold) | How many cleared your bar |
| Completion rate | How many started vs. finished |
| No-show count | Candidates who registered but never joined |
| Score histogram (5 buckets) | Full distribution in one glance |
| Per-question difficulty (P-value) | % who got each question correct |
| Per-question response time | Which questions slow candidates down |
| Discrimination index per question | Which questions are doing useful work |
| Option frequency | Which wrong answers are most popular |
| Timeout count | Candidates who ran out of time |
| Tab switch totals | Cheating pressure indicators |
| Disqualification breakdown | By reason (tab switch vs. duplicate login) |
| Test difficulty classification | Easy / Moderate / Hard / Very Hard |

This is enough to do a full psychometric audit of a test battery — identifying questions to retire, questions that are too easy, and questions that have a plausible-looking wrong answer attracting too many candidates.

---

### 5. Scales to 15,000 Without Breaking a Sweat

The waiting room is the hardest engineering problem in mass assessment. When 15,000 people are refreshing a page waiting for the session to start, you have two choices: melt the database, or cache.

We cache. Every call to the session-status endpoint is served from Redis with a 15-second TTL. That means the database sees roughly one read per 15 seconds regardless of how many candidates are polling. When the admin starts the session, we invalidate the cache immediately — candidates see the "Start Now" button within 10 seconds.

For the exam itself, the WebSocket layer (Socket.IO on a dedicated server with Redis Pub/Sub) handles real-time events. The Next.js API handles stateless REST calls. These two layers scale independently. When traffic increases, you add replicas to either without changing any code.

**The result:** One admin. One button. 15,000 people sit the same exam at the same moment.

---

### 6. Candidate Onboarding at Scale

**Bulk CSV import:** Upload a spreadsheet with name and email columns. The system:
- Generates unique Access IDs (campaign-prefixed, sequential)
- Generates readable 8-character passwords (no ambiguous characters like 0/O/1/I)
- Hashes all passwords in batches of 100
- Emails every candidate their credentials via Resend

A batch of 15,000 credentials processes in minutes, not hours.

**Self-service registration (campaign slug):** Candidates register themselves at a public URL. The system validates that the campaign is open, not full, and not expired. Credentials are returned immediately.

**Password recovery:** Email OTP flow with 15-minute expiry. Bcrypt-hashed OTPs. Confirmation email on reset. Available without admin involvement.

---

### 7. Geographic Restrictions

Set a comma-separated list of ISO country codes on a campaign. Any candidate whose country doesn't match is blocked at the question delivery endpoint — not just at login. They see a clear message and are redirected out of the exam flow. Useful for role-specific legal compliance or regional hiring rounds.

---

### 8. White-Label Ready

Every candidate-facing page pulls from a branding configuration:
- Organisation name and tagline
- Logo URL
- Primary colour (applied to buttons, gradients, timers, ring borders)

This can be overridden per campaign. Run a "Barclays Graduate Intake 2025" session and a "Barclays Operations Hiring" session with different logos and colours — candidates see consistent branding for their specific programme, not a generic platform.

---

### 9. Admin Live Control

During a live session, the admin can:

- **Broadcast a message** to all candidates simultaneously (appears as a toast notification within 20 seconds via the polling fallback, instantly via socket)
- **Pause the session** (candidates see a paused state, can't progress)
- **Resume the session**
- **Manually disqualify** a specific candidate with a typed reason
- **End the session** (all candidates notified)
- **Monitor in real-time:** See every candidate's status (Waiting → Active → Completed → Disqualified) in a live grid

---

### 10. Multiple Question Types in One Exam

| Type | Scoring | Use Case |
|------|---------|----------|
| MCQ | Correct option + speed bonus | Aptitude, numeracy, verbal reasoning |
| Image-based MCQ | Same as MCQ | Diagram reading, situational awareness |
| Psychometric | Base points always | Personality, culture fit (invisible to candidate) |
| Rating | Base points always | Self-assessment, behavioural indicators |

All four types can appear in the same exam. Candidates cannot distinguish scored from non-scored questions.

---

## What This Platform Replaces

| What you're probably using | Problem | How we solve it |
|---------------------------|---------|-----------------|
| Google Forms / Typeform | No proctoring, no scoring, no timing | Real-time anti-cheat, scored questions, per-question timers |
| HackerRank / Codility | Expensive, built for technical interviews not mass hiring | Purpose-built for volume, not developer assessments |
| Mettl / SHL Online | Enterprise pricing, no customisation without a sales call, black-box scoring | Full access to scoring logic, white-label, you own the platform |
| Manual proctored centres | Can't scale, expensive logistics, geographic limits | 15,000 candidates from anywhere, instantly |
| In-house Excel scoring | Manual, error-prone, slow turnaround | Instant results, percentile ranking, analytics dashboard |

---

## What's on the Roadmap

- Video proctoring (AI-based)
- Multi-tenant (multiple organisations on one deployment)
- PDF export of candidate results
- Candidate self-scheduling for time slots
- API access for HR system integration (ATS, HRIS)
- Section-based exams (timed sections, different rules per section)

---

## Bottom Line

If you're hiring more than 500 people in a single round, you need infrastructure that was designed for it. PreCognise is that infrastructure — not a quiz tool with an enterprise price tag, but a real-time assessment engine with the depth of analytics and the integrity controls that a serious hiring process deserves.

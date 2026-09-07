import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { CampaignStatus, CandidateStatus, Prisma, type Candidate } from "@prisma/client";
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";
import { campaignLastEntryAt } from "@/lib/campaign-window";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

const MAX_OPEN_JOIN_CREATE_ATTEMPTS = 3;

// Marker used to signal "campaign is at capacity" out of the retry loop
// below without it being swallowed as a generic 500.
class CampaignAtCapacityError extends Error {}

// Concurrent open-join registrations can race: two requests (even with
// different emails) can both read the same existingAccessIds, compute the
// same nextAccessSeq, and collide on the @@unique([accessId, campaignId])
// constraint at create time. Retry on that specific race — re-checking for
// a same-email winner first (another request may have already created
// exactly this candidate; adopt it), otherwise re-rolling the accessId with
// a fresh read (a different-email accessId collision) — rather than
// failing the registration outright.
async function createOpenJoinCandidate(
  campaign: { id: string; name: string; maxCandidates: number | null },
  emailNorm: string,
  trimmedName: string,
  consentIp: string,
): Promise<Candidate> {
  for (let attempt = 1; attempt <= MAX_OPEN_JOIN_CREATE_ATTEMPTS; attempt++) {
    const existingAccessIds = await prisma.candidate.findMany({
      where: { campaignId: campaign.id },
      select: { accessId: true },
    });

    if (campaign.maxCandidates && existingAccessIds.length >= campaign.maxCandidates) {
      throw new CampaignAtCapacityError();
    }

    const nextSeq = nextAccessSeq(existingAccessIds);
    const newAccessId = makeAccessId(campaign.name, nextSeq, campaign.maxCandidates);
    const plainPassword = generatePassword();

    try {
      return await prisma.candidate.create({
        data: {
          accessId: newAccessId,
          email: emailNorm,
          name: trimmedName,
          passwordHash: await hashPassword(plainPassword),
          generatedPassword: plainPassword,
          campaignId: campaign.id,
          status: CandidateStatus.REGISTERED,
          // PIPEDA consent (task #30) — the caller has already verified
          // body.consent === true before reaching here; this records when
          // and from where.
          consentedAt: new Date(),
          consentIp,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Someone else won the race — either the same email (adopt their
        // row) or a different email that collided on accessId (retry with
        // a freshly-read sequence).
        const winner = await prisma.candidate.findFirst({
          where: { email: emailNorm, campaignId: campaign.id },
        });
        if (winner) return winner;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not register candidate after multiple attempts");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessId, password, joinToken, mode, name, email, consent } = body;

    // Rate-limit: a loose per-IP bucket that catches obvious spray attacks
    // without punishing a shared exam-centre/school network, plus a tight
    // per-account bucket (scoped to this specific campaign + accessId/email)
    // that stops brute-forcing one candidate's password regardless of how
    // many IPs it comes from. Checked before the campaign/candidate lookup
    // so a flood of garbage requests doesn't reach the DB either.
    const ip = getClientIp(req);
    const ipLimit = await checkRateLimit(redis, `login:ip:${ip}`, 60, 300);
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }
    const accountKey = mode === "open" ? String(email ?? "").trim().toLowerCase() : String(accessId ?? "").trim().toUpperCase();
    if (accountKey && joinToken) {
      const accountLimit = await checkRateLimit(redis, `login:account:${joinToken}:${accountKey}`, 10, 600);
      if (!accountLimit.allowed) {
        return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
      }
    }

    // Resolve campaign from joinToken
    const campaign = joinToken
      ? await prisma.campaign.findUnique({ where: { joinToken } })
      : null;

    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 400 });
    }

    if (campaign.status !== CampaignStatus.LIVE && campaign.status !== CampaignStatus.PAUSED) {
      return NextResponse.json({ error: "This assessment is not currently open" }, { status: 403 });
    }

    let candidate: Candidate;

    if (mode === "open") {
      if (!campaign.openJoinEnabled) {
        return NextResponse.json({ error: "This assessment does not accept open joins" }, { status: 403 });
      }
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
      }
      // PIPEDA consent (task #30) — server-enforced, not just a disabled
      // submit button on the client.
      if (consent !== true) {
        return NextResponse.json({ error: "You must agree to the privacy policy to register" }, { status: 400 });
      }

      const lastEntryAt = campaignLastEntryAt(campaign);
      if (lastEntryAt && new Date() > lastEntryAt) {
        return NextResponse.json({ error: "This assessment's entry window has closed" }, { status: 403 });
      }

      const emailNorm = email.trim().toLowerCase();
      const existingCandidate = await prisma.candidate.findFirst({
        where: { email: emailNorm, campaignId: campaign.id },
      });

      if (existingCandidate) {
        candidate = existingCandidate;
      } else {
        try {
          candidate = await createOpenJoinCandidate(campaign, emailNorm, name.trim(), ip);
        } catch (err) {
          if (err instanceof CampaignAtCapacityError) {
            return NextResponse.json({ error: "Campaign is at maximum candidate capacity" }, { status: 422 });
          }
          throw err;
        }
      }

      if (candidate.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }
    } else {
      if (!accessId?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "Access ID and password are required" }, { status: 400 });
      }

      const found = await prisma.candidate.findFirst({
        where: { accessId: accessId.trim().toUpperCase(), campaignId: campaign.id },
      });

      if (!found) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (found.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }

      const lastEntryAt = campaignLastEntryAt(campaign);
      if (lastEntryAt && new Date() > lastEntryAt) {
        return NextResponse.json({ error: "This assessment's entry window has closed" }, { status: 403 });
      }

      const valid = await bcrypt.compare(password, found.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      candidate = found;
    }

    // Atomic single-session enforcement
    const claimed = await prisma.candidate.updateMany({
      where: { id: candidate.id, activeToken: null },
      data: { activeToken: "pending", status: CandidateStatus.JOINED },
    });

    if (claimed.count === 0) {
      if (campaign.disqualifyOnDuplicateLogin) {
        // Disqualify and kill both sessions
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: "Duplicate login detected — assessment rules prohibit logging in from multiple devices.",
            activeToken: null,
          },
        });
        return NextResponse.json(
          { error: "You have been disqualified: login attempted from a second device." },
          { status: 403 }
        );
      }
      // Soft block — just reject the second device, first session continues
      return NextResponse.json(
        { error: "You are already logged in from another device." },
        { status: 409 }
      );
    }

    const token = signToken({ candidateId: candidate.id, campaignId: campaign.id });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { activeToken: token } });

    return NextResponse.json({ token, candidateName: candidate.name });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashPassword } from "@/lib/campaign-utils";
import { sendPasswordChanged } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

// Locks the *current* code after 5 wrong guesses — independent of #74's
// time-window rate limiting, which bounds request rate but not total
// guesses against one still-valid code within its 15-minute window.
const OTP_ATTEMPT_LIMIT = 5;

export async function POST(req: NextRequest) {
  try {
    const { email, joinToken, code, newPassword } = await req.json();

    if (!email?.trim() || !joinToken?.trim() || !code?.trim() || !newPassword?.trim()) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Same shape as login's rate limiting: loose per-IP, tight per-account
    // — a 6-digit OTP is far more guessable than a real password, so this
    // matters even more here.
    const ip = getClientIp(req);
    const ipLimit = await checkRateLimit(redis, `otp:ip:${ip}`, 60, 300);
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }
    const accountLimit = await checkRateLimit(
      redis,
      `otp:account:${joinToken.trim()}:${email.trim().toLowerCase()}`,
      10,
      600
    );
    if (!accountLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { joinToken } });
    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: email.trim().toLowerCase(), campaignId: campaign.id },
    });

    if (!candidate || !candidate.otpHash || !candidate.otpExpiresAt) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (candidate.otpExpiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    // Same generic message as an expired/invalid code — don't tell an
    // attacker whether they're locked out vs. just wrong, or that the
    // account/code exists at all.
    if (candidate.otpAttempts >= OTP_ATTEMPT_LIMIT) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    const valid = await bcrypt.compare(code, candidate.otpHash);
    if (!valid) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { otpAttempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { passwordHash, otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });

    await sendPasswordChanged({ to: candidate.email, name: candidate.name });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/verify-otp error:", err);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}

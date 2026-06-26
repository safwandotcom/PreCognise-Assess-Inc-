import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashPassword } from "@/lib/campaign-utils";
import { sendPasswordChanged } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, joinToken, code, newPassword } = await req.json();

    if (!email?.trim() || !joinToken?.trim() || !code?.trim() || !newPassword?.trim()) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
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

    const valid = await bcrypt.compare(code, candidate.otpHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { passwordHash, otpHash: null, otpExpiresAt: null },
    });

    await sendPasswordChanged({ to: candidate.email, name: candidate.name });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/verify-otp error:", err);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}

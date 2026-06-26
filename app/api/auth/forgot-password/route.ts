import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/campaign-utils";
import { sendOTP } from "@/lib/email";
import { randomInt } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email, joinToken } = await req.json();

    if (!email?.trim() || !joinToken?.trim()) {
      return NextResponse.json({ error: "email and joinToken are required" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { joinToken } });
    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 404 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: email.trim().toLowerCase(), campaignId: campaign.id },
    });

    // Return ok regardless of whether candidate exists — prevents email enumeration
    if (!candidate) {
      return NextResponse.json({ ok: true });
    }

    const rawCode = String(randomInt(100000, 1000000));
    const otpHash = await hashPassword(rawCode);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { otpHash, otpExpiresAt },
    });

    await sendOTP({ to: candidate.email, name: candidate.name, code: rawCode });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/forgot-password error:", err);
    return NextResponse.json({ error: "Failed to send reset code" }, { status: 500 });
  }
}

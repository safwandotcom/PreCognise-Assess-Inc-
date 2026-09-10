import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/campaign-utils";
import { sendOTP } from "@/lib/email";
import { randomInt } from "crypto";
import { parseBody } from "@/lib/validate-body";
import { forgotPasswordSchema } from "./schema";

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(forgotPasswordSchema, req, "email and joinToken are required");
    if ("error" in parsed) return parsed.error;
    const { email, joinToken } = parsed.data;

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
      // Reset the wrong-attempt counter — it locks the *current* code, not
      // the account, so a fresh code gets a fresh 5 tries.
      data: { otpHash, otpExpiresAt, otpAttempts: 0 },
    });

    await sendOTP({ to: candidate.email, name: candidate.name, code: rawCode });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/forgot-password error:", err);
    return NextResponse.json({ error: "Failed to send reset code" }, { status: 500 });
  }
}

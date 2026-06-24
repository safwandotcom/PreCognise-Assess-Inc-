import { NextRequest, NextResponse } from "next/server";
import { CandidateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, otp } = await req.json();

    if (!rollNumber || !otp) {
      return NextResponse.json(
        { message: "rollNumber and otp are required" },
        { status: 400 }
      );
    }

    const candidate = await prisma.candidate.findUnique({
      where: { rollNumber },
    });

    if (!candidate || !candidate.otpCode || !candidate.otpExpiresAt) {
      return NextResponse.json({ message: "Invalid or expired OTP" }, { status: 401 });
    }

    const isMatch = candidate.otpCode === otp;
    const isExpired = candidate.otpExpiresAt.getTime() < Date.now();

    if (!isMatch || isExpired) {
      return NextResponse.json({ message: "Invalid or expired OTP" }, { status: 401 });
    }

    // Duplicate login detection: if activeToken already set, disqualify both
    if (candidate.activeToken) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.DISQUALIFIED,
          activeToken: null,
          otpCode: null,
          otpExpiresAt: null,
          disqualifyReason: "Duplicate login detected — credentials used on multiple devices",
        },
      });
      return NextResponse.json(
        {
          message:
            "Your credentials have been used on another device — both attempts have been disqualified.",
        },
        { status: 409 }
      );
    }

    const newActiveToken = randomUUID();

    const updated = await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        status: CandidateStatus.JOINED,
        activeToken: newActiveToken,
      },
    });

    const token = signToken(updated.id, updated.rollNumber);

    return NextResponse.json(
      {
        token,
        name: updated.name,
        rollNumber: updated.rollNumber,
        activeToken: newActiveToken,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

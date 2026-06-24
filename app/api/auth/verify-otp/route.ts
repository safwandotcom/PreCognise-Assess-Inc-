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

    const newActiveToken = randomUUID();

    // Atomic claim: only updates the row if activeToken is still null.
    // count === 0 means another concurrent request already claimed it.
    const claim = await prisma.candidate.updateMany({
      where: { id: candidate.id, activeToken: null },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        status: CandidateStatus.JOINED,
        activeToken: newActiveToken,
      },
    });

    if (claim.count === 0) {
      // Another request beat us — disqualify this candidate entirely
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

    const token = signToken(candidate.id, candidate.rollNumber);

    return NextResponse.json(
      {
        token,
        name: candidate.name,
        rollNumber: candidate.rollNumber,
        activeToken: newActiveToken,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

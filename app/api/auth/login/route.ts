import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, email, password, joinToken } = await req.json();

    if (!rollNumber || !email || !password) {
      return NextResponse.json(
        { message: "rollNumber, email and password are required" },
        { status: 400 }
      );
    }

    // If joinToken provided, scope lookup to that session
    let candidate;
    if (joinToken) {
      const session = await prisma.session.findUnique({
        where: { joinToken },
        select: { id: true },
      });
      if (!session) {
        return NextResponse.json({ message: "Invalid session link" }, { status: 401 });
      }
      candidate = await prisma.candidate.findFirst({
        where: { rollNumber, email, sessionId: session.id },
      });
    } else {
      candidate = await prisma.candidate.findFirst({
        where: { rollNumber, email },
      });
    }

    if (!candidate) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, candidate.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { otpCode: "123456", otpExpiresAt },
    });

    return NextResponse.json({ message: "OTP sent" }, { status: 200 });
  } catch (err) {
    console.error("login error:", err);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

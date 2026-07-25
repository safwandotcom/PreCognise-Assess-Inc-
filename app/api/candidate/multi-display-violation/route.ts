import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { multiDisplayViolationCount: true },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newCount = candidate.multiDisplayViolationCount + 1;
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { multiDisplayViolationCount: newCount },
    });

    return NextResponse.json({ count: newCount });
  } catch (err) {
    console.error("POST /api/candidate/multi-display-violation error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

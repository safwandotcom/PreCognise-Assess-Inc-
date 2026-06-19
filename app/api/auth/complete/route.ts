// app/api/auth/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import {prisma} from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.split(" ")[1] ?? "";
    const { candidateId } = verifyToken(token);
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "COMPLETED" },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
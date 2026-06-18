// app/api/admin/disqualify/route.ts
import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { candidateId, reason } = await req.json();

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: "DISQUALIFIED",
        disqualifyReason: reason,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Disqualify route error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
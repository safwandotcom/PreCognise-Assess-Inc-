// app/api/admin/campaigns/[id]/candidates/[candidateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; candidateId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { candidateId } = await params;
  await prisma.candidate.delete({ where: { id: candidateId } });
  return NextResponse.json({ ok: true });
}

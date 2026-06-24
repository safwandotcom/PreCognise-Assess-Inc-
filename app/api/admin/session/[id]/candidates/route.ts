// app/api/admin/session/[id]/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const candidates = await prisma.candidate.findMany({
      where: { sessionId: id },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        status: true,
        disqualifyReason: true,
        tabSwitchCount: true,
      },
      orderBy: { rollNumber: "asc" },
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("GET /api/admin/session/[id]/candidates error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { name, email, rollNumber } = await req.json();

    if (!name?.trim() || !email?.trim() || !rollNumber?.trim()) {
      return NextResponse.json(
        { error: "name, email, and rollNumber are required" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const emailNorm = email.trim().toLowerCase();
    const existing = await prisma.candidate.findFirst({
      where: { OR: [{ email: emailNorm }, { rollNumber: rollNumber.trim() }], sessionId: id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A candidate with this email or roll number already exists in this session" },
        { status: 409 }
      );
    }

    const plainPassword = generatePassword();
    const passwordHash = await hashPassword(plainPassword);

    const candidate = await prisma.candidate.create({
      data: {
        rollNumber: rollNumber.trim(),
        email: emailNorm,
        name: name.trim(),
        passwordHash,
        generatedPassword: plainPassword,
        sessionId: id,
      },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        status: true,
      },
    });

    return NextResponse.json({ candidate, password: plainPassword }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/session/[id]/candidates error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// app/api/admin/session/[id]/candidates/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword } from "@/lib/campaign-utils";

type ImportRow = { name: string; rollNumber: string; email: string };
type ImportedCandidate = { rollNumber: string; name: string; email: string; password: string };

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { rows }: { rows: ImportRow[] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Detect intra-batch duplicates before touching the DB
    const batchRolls = rows.map((r) => r.rollNumber?.trim()).filter(Boolean);
    const batchEmails = rows.map((r) => r.email?.trim().toLowerCase()).filter(Boolean);
    const dupRolls = batchRolls.filter((r, i) => batchRolls.indexOf(r) !== i);
    const dupEmails = batchEmails.filter((e, i) => batchEmails.indexOf(e) !== i);

    if (dupRolls.length > 0 || dupEmails.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate entries in CSV",
          duplicateRollNumbers: [...new Set(dupRolls)],
          duplicateEmails: [...new Set(dupEmails)],
        },
        { status: 422 }
      );
    }

    const created: ImportedCandidate[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.email?.trim() || !row.rollNumber?.trim()) {
        skipped.push(`Row missing name, email, or rollNumber`);
        continue;
      }

      const email = row.email.trim().toLowerCase();
      const rollNumber = row.rollNumber.trim();

      const exists = await prisma.candidate.findFirst({
        where: {
          sessionId: id,
          OR: [{ email }, { rollNumber }],
        },
      });
      if (exists) {
        skipped.push(`${rollNumber} / ${email} — already in session`);
        continue;
      }

      const plainPassword = generatePassword();
      const passwordHash = await hashPassword(plainPassword);

      await prisma.candidate.create({
        data: {
          rollNumber,
          email,
          name: row.name.trim(),
          passwordHash,
          generatedPassword: plainPassword,
          sessionId: id,
        },
      });

      created.push({ rollNumber, name: row.name.trim(), email, password: plainPassword });
    }

    return NextResponse.json({ created, skipped });
  } catch (err) {
    console.error("POST /api/admin/session/[id]/candidates/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

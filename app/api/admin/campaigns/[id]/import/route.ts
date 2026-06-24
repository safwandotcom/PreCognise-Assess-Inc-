import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeRollNumber } from "@/lib/campaign-utils";

type ImportRow = { name: string; email: string; country?: string };
type ImportedCandidate = { rollNumber: string; name: string; email: string; password: string };

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { rows }: { rows: ImportRow[] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { _count: { select: { candidates: true } } },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let seq = campaign._count.candidates + 1;
    const created: ImportedCandidate[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.email?.trim()) {
        skipped.push(`Row missing name or email`);
        continue;
      }

      const email = row.email.trim().toLowerCase();

      const exists = await prisma.candidate.findFirst({ where: { email, sessionId: campaign.sessionId } });
      if (exists) {
        skipped.push(`${email} — already registered`);
        continue;
      }

      const rollNumber = makeRollNumber(campaign.slug, seq);
      const tempPassword = generatePassword();
      const passwordHash = await hashPassword(tempPassword);

      await prisma.candidate.create({
        data: {
          rollNumber,
          email,
          name: row.name.trim(),
          country: row.country?.trim() || null,
          passwordHash,
          sessionId: campaign.sessionId,
          campaignId: campaign.id,
        },
      });

      created.push({ rollNumber, name: row.name.trim(), email, password: tempPassword });
      seq++;
    }

    return NextResponse.json({ created, skipped });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

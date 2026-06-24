// app/api/admin/campaigns/[id]/candidates/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  // body.rows: Array<{ name: string; email: string }>
  const rows: { name: string; email: string }[] = body.rows ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (campaign.maxCandidates && rows.length > campaign.maxCandidates) {
    return NextResponse.json(
      { error: `Row count ${rows.length} exceeds maxCandidates ${campaign.maxCandidates}` },
      { status: 422 }
    );
  }

  // Detect duplicate emails within the uploaded file
  const emailsSeen = new Set<string>();
  const dupes: number[] = [];
  rows.forEach((r, i) => {
    const e = r.email?.trim().toLowerCase();
    if (emailsSeen.has(e)) dupes.push(i + 1);
    else emailsSeen.add(e);
  });
  if (dupes.length > 0) {
    return NextResponse.json({ error: `Duplicate emails at rows: ${dupes.join(", ")}` }, { status: 422 });
  }

  const existingCount = await prisma.candidate.count({ where: { campaignId: id } });

  // Hash passwords in batches of 100 to avoid timeout
  const BATCH = 100;
  const credentials: { name: string; email: string; accessId: string; password: string; passwordHash: string }[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const hashed = await Promise.all(
      slice.map(async (r, j) => {
        const seq = existingCount + i + j + 1;
        const accessId = makeAccessId(campaign.name, seq);
        const password = generatePassword();
        const passwordHash = await hashPassword(password);
        return { name: r.name.trim(), email: r.email.trim().toLowerCase(), accessId, password, passwordHash };
      })
    );
    credentials.push(...hashed);
  }

  await prisma.candidate.createMany({
    data: credentials.map(c => ({
      accessId: c.accessId,
      email: c.email,
      name: c.name,
      passwordHash: c.passwordHash,
      generatedPassword: c.password,
      campaignId: id,
    })),
    skipDuplicates: true,
  });

  const imported = credentials.length;
  return NextResponse.json({
    imported,
    credentials: credentials.map(c => ({ name: c.name, accessId: c.accessId, email: c.email, password: c.password })),
  }, { status: 201 });
}

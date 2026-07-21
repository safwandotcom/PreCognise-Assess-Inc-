import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    return await handleImport(req, params);
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/candidates/import failed:", err);
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}

async function handleImport(req: NextRequest, params: Params["params"]) {
  const { id } = await params;
  const body = await req.json();
  const rows: { name: string; email: string }[] = body.rows ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

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

  const existingAccessIds = await prisma.candidate.findMany({
    where: { campaignId: id },
    select: { accessId: true },
  });
  const existingCount = existingAccessIds.length;

  if (campaign.maxCandidates && existingCount + rows.length > campaign.maxCandidates) {
    return NextResponse.json(
      { error: `Import would exceed maxCandidates (${campaign.maxCandidates}). Currently ${existingCount} candidates registered.` },
      { status: 422 }
    );
  }

  const startSeq = nextAccessSeq(existingAccessIds);

  const emailList = rows.map((r) => r.email.trim().toLowerCase());
  const existingInDb = await prisma.candidate.findMany({
    where: { campaignId: id, email: { in: emailList } },
    select: { email: true },
  });
  if (existingInDb.length > 0) {
    return NextResponse.json(
      { error: `These emails are already registered: ${existingInDb.map((c) => c.email).join(", ")}` },
      { status: 422 }
    );
  }

  const BATCH = 100;
  const credentials: { name: string; email: string; accessId: string; password: string; passwordHash: string }[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const hashed = await Promise.all(
      slice.map(async (r, j) => {
        const seq = startSeq + i + j;
        const accessId = makeAccessId(campaign.name, seq, campaign.maxCandidates);
        const password = generatePassword();
        const passwordHash = await hashPassword(password);
        return { name: r.name.trim(), email: r.email.trim().toLowerCase(), accessId, password, passwordHash };
      })
    );
    credentials.push(...hashed);
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.createMany({
      data: credentials.map((c) => ({
        accessId: c.accessId,
        email: c.email,
        name: c.name,
        passwordHash: c.passwordHash,
        generatedPassword: c.password,
        campaignId: id,
      })),
    });
  });

  // Read back the created rows to return their ids (createMany doesn't return records).
  const created = await prisma.candidate.findMany({
    where: { campaignId: id, email: { in: credentials.map((c) => c.email) } },
    select: { id: true, name: true, accessId: true, email: true, generatedPassword: true },
  });

  return NextResponse.json(
    {
      imported: created.length,
      candidates: created.map((c) => ({
        id: c.id,
        name: c.name,
        accessId: c.accessId,
        email: c.email,
        password: c.generatedPassword ?? "",
      })),
    },
    { status: 201 }
  );
}

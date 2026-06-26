import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId, formatExamDate } from "@/lib/campaign-utils";
import { sendCredentials } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
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

  const existingCount = await prisma.candidate.count({ where: { campaignId: id } });

  if (campaign.maxCandidates && existingCount + rows.length > campaign.maxCandidates) {
    return NextResponse.json(
      { error: `Import would exceed maxCandidates (${campaign.maxCandidates}). Currently ${existingCount} candidates registered.` },
      { status: 422 }
    );
  }

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
        const seq = existingCount + i + j + 1;
        const accessId = makeAccessId(campaign.name, seq);
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

  // Fetch org branding for email template
  const branding = await prisma.orgBranding.findFirst();
  const orgName = branding?.orgName ?? "PreCognise";
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/candidate/login`;
  const examDate = campaign.scheduledAt ? formatExamDate(campaign.scheduledAt) : undefined;

  const emailResults = await Promise.allSettled(
    credentials.map((c) =>
      sendCredentials({
        to: c.email,
        name: c.name,
        accessId: c.accessId,
        password: c.password,
        loginUrl,
        examDate,
        orgName,
      })
    )
  );

  const emailFailures = emailResults
    .map((r, i) => (r.status === "rejected" ? credentials[i].email : null))
    .filter((e): e is string => e !== null);

  return NextResponse.json(
    {
      imported: credentials.length,
      emailFailures,
      credentials: credentials.map((c) => ({ name: c.name, accessId: c.accessId, email: c.email, password: c.password })),
    },
    { status: 201 }
  );
}

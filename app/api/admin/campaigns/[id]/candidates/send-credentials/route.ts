import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCredentialsBatch, type SendCredentialsOpts } from "@/lib/email";
import { formatExamDate } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

const MAX_PER_REQUEST = 200;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const candidateIds: string[] = Array.isArray(body.candidateIds) ? body.candidateIds : [];

    if (candidateIds.length === 0) {
      return NextResponse.json({ error: "candidateIds is required" }, { status: 400 });
    }
    if (candidateIds.length > MAX_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many candidates in one send (max ${MAX_PER_REQUEST}). Select fewer and try again.` },
        { status: 422 }
      );
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds }, campaignId: id },
      select: { name: true, email: true, accessId: true, generatedPassword: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL environment variable is not set");
    const joinUrl = `${appUrl}/join/${campaign.joinToken}`;

    const branding = await prisma.orgBranding.findFirst();
    const orgName = branding?.orgName ?? "PreCognise";
    const examDate = campaign.scheduledAt ? formatExamDate(campaign.scheduledAt) : undefined;

    const recipients: SendCredentialsOpts[] = candidates
      .filter((c) => c.generatedPassword)
      .map((c) => ({
        to: c.email,
        name: c.name,
        accessId: c.accessId,
        password: c.generatedPassword as string,
        joinUrl,
        examDate,
        orgName,
      }));

    const { sent, failed } = await sendCredentialsBatch(recipients);

    return NextResponse.json({ sent: sent.length, failed: failed.length, failedEmails: failed });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/candidates/send-credentials failed:", err);
    return NextResponse.json({ error: "Failed to send emails. Please try again." }, { status: 500 });
  }
}

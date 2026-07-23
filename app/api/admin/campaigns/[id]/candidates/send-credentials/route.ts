import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCredentialsBatch, type SendCredentialsOpts } from "@/lib/email";
import { formatExamDate } from "@/lib/campaign-utils";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";
import { getBrandingForOwner } from "@/lib/branding";

type Params = { params: Promise<{ id: string }> };

const MAX_PER_REQUEST = 200;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds }, campaignId: id },
      select: { name: true, email: true, accessId: true, generatedPassword: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL environment variable is not set");
    const joinUrl = `${appUrl}/join/${campaign.joinToken}`;

    const branding = await getBrandingForOwner(ownerId);
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

    if (failed.length > 0) {
      console.error(
        `send-credentials: ${failed.length} email(s) failed for campaign ${id}:`,
        failed.map((f) => `${f.email}: ${f.error}`).join("; ")
      );
    }

    return NextResponse.json({
      sent: sent.length,
      failed: failed.length,
      failedEmails: failed.map((f) => f.email),
      reason: failed[0]?.error,
    });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/candidates/send-credentials failed:", err);
    return NextResponse.json({ error: "Failed to send emails. Please try again." }, { status: 500 });
  }
}

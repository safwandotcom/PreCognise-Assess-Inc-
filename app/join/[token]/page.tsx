import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { joinToken: token } });

  if (!campaign) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-[#64748B]">Invalid join link.</p>
      </main>
    );
  }

  if (campaign.status === CampaignStatus.LIVE || campaign.status === CampaignStatus.PAUSED) {
    redirect(`/candidate/login?token=${token}`);
  }

  const message =
    campaign.status === CampaignStatus.DRAFT
      ? "This assessment is not yet available."
      : campaign.status === CampaignStatus.SCHEDULED
      ? `Assessment opens at ${campaign.scheduledAt?.toLocaleString() ?? "a scheduled time"}.`
      : "This assessment has closed.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm max-w-sm w-full">
        <p className="text-lg font-semibold text-[#0F172A]">{campaign.name}</p>
        <p className="mt-2 text-sm text-[#64748B]">{message}</p>
      </div>
    </main>
  );
}

import { prisma } from "@/lib/prisma";
import JoinGate from "./JoinGate";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { joinToken: token },
    select: {
      name: true,
      status: true,
      scheduledAt: true,
      startedAt: true,
      gracePeriodMin: true,
    },
  });

  if (!campaign) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm max-w-sm w-full">
          <p className="text-sm font-semibold text-[#0F172A]">Invalid join link</p>
          <p className="mt-1 text-xs text-[#64748B]">This link is not valid or has been removed.</p>
        </div>
      </main>
    );
  }

  return (
    <JoinGate
      name={campaign.name}
      status={campaign.status}
      scheduledAt={campaign.scheduledAt?.toISOString() ?? null}
      startedAt={campaign.startedAt?.toISOString() ?? null}
      gracePeriodMin={campaign.gracePeriodMin}
      token={token}
    />
  );
}

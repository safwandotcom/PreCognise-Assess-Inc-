import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await prisma.session.findUnique({
    where: { joinToken: token },
    select: { status: true, title: true },
  });

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#0F172A]">Invalid link</p>
          <p className="mt-2 text-sm text-[#64748B]">This join link does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  if (session.status === "ENDED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#0F172A]">{session.title}</p>
          <p className="mt-2 text-sm text-[#64748B]">This session has ended. No further logins are accepted.</p>
        </div>
      </div>
    );
  }

  redirect(`/candidate/login?token=${token}`);
}

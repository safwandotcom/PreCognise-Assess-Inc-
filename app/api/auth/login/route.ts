import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { CampaignStatus, CandidateStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const { accessId, password, joinToken } = await req.json();

    if (!accessId?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Access ID and password are required" }, { status: 400 });
    }

    // Resolve campaign from joinToken
    const campaign = joinToken
      ? await prisma.campaign.findUnique({ where: { joinToken } })
      : null;

    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 400 });
    }

    if (campaign.status !== CampaignStatus.LIVE && campaign.status !== CampaignStatus.PAUSED) {
      return NextResponse.json({ error: "This assessment is not currently open" }, { status: 403 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { accessId: accessId.trim().toUpperCase(), campaignId: campaign.id },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (candidate.status === CandidateStatus.DISQUALIFIED) {
      return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
    }

    const valid = await bcrypt.compare(password, candidate.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Atomic single-session enforcement
    const claimed = await prisma.candidate.updateMany({
      where: { id: candidate.id, activeToken: null },
      data: { activeToken: "pending", status: CandidateStatus.JOINED },
    });

    let token: string;
    if (claimed.count === 0) {
      // Already has an active session — return existing token
      const refreshed = await prisma.candidate.findUnique({ where: { id: candidate.id } });
      if (!refreshed?.activeToken || refreshed.activeToken === "pending") {
        return NextResponse.json({ error: "Already logged in from another device" }, { status: 409 });
      }
      token = refreshed.activeToken;
    } else {
      token = signToken({ candidateId: candidate.id, campaignId: campaign.id });
      await prisma.candidate.update({ where: { id: candidate.id }, data: { activeToken: token } });
    }

    return NextResponse.json({ token, candidateName: candidate.name });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

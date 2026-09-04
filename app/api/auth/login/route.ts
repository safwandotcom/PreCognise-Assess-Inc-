import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { CampaignStatus, CandidateStatus, type Candidate } from "@prisma/client";
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";
import { campaignLastEntryAt } from "@/lib/campaign-window";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessId, password, joinToken, mode, name, email } = body;

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

    let candidate: Candidate;

    if (mode === "open") {
      if (!campaign.openJoinEnabled) {
        return NextResponse.json({ error: "This assessment does not accept open joins" }, { status: 403 });
      }
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
      }

      const lastEntryAt = campaignLastEntryAt(campaign);
      if (lastEntryAt && new Date() > lastEntryAt) {
        return NextResponse.json({ error: "This assessment's entry window has closed" }, { status: 403 });
      }

      const emailNorm = email.trim().toLowerCase();
      const existingCandidate = await prisma.candidate.findFirst({
        where: { email: emailNorm, campaignId: campaign.id },
      });

      if (existingCandidate) {
        candidate = existingCandidate;
      } else {
        const existingAccessIds = await prisma.candidate.findMany({
          where: { campaignId: campaign.id },
          select: { accessId: true },
        });
        const nextSeq = nextAccessSeq(existingAccessIds);
        const newAccessId = makeAccessId(campaign.name, nextSeq, campaign.maxCandidates);
        const plainPassword = generatePassword();
        candidate = await prisma.candidate.create({
          data: {
            accessId: newAccessId,
            email: emailNorm,
            name: name.trim(),
            passwordHash: await hashPassword(plainPassword),
            generatedPassword: plainPassword,
            campaignId: campaign.id,
            status: CandidateStatus.REGISTERED,
          },
        });
      }

      if (candidate.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }
    } else {
      if (!accessId?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "Access ID and password are required" }, { status: 400 });
      }

      const found = await prisma.candidate.findFirst({
        where: { accessId: accessId.trim().toUpperCase(), campaignId: campaign.id },
      });

      if (!found) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (found.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }

      const valid = await bcrypt.compare(password, found.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      candidate = found;
    }

    // Atomic single-session enforcement
    const claimed = await prisma.candidate.updateMany({
      where: { id: candidate.id, activeToken: null },
      data: { activeToken: "pending", status: CandidateStatus.JOINED },
    });

    if (claimed.count === 0) {
      if (campaign.disqualifyOnDuplicateLogin) {
        // Disqualify and kill both sessions
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: "Duplicate login detected — assessment rules prohibit logging in from multiple devices.",
            activeToken: null,
          },
        });
        return NextResponse.json(
          { error: "You have been disqualified: login attempted from a second device." },
          { status: 403 }
        );
      }
      // Soft block — just reject the second device, first session continues
      return NextResponse.json(
        { error: "You are already logged in from another device." },
        { status: 409 }
      );
    }

    const token = signToken({ candidateId: candidate.id, campaignId: campaign.id });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { activeToken: token } });

    return NextResponse.json({ token, candidateName: candidate.name });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

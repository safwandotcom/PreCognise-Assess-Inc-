import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { getSettings } from "@/lib/get-settings";
import { PublicQuestion, QuestionType } from "@/types";

function getBearerToken(req: NextRequest): string | null {
    const header = req.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    return header.slice(7);
}

export async function GET(req: NextRequest) {
    const token = getBearerToken(req);
    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    let candidateId: string;
    try {
        candidateId = verifyToken(token).candidateId;
    } catch {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { campaignId: true, status: true, country: true },
    });

    if (!candidate) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (candidate.status === "DISQUALIFIED") {
        return NextResponse.json(
            { error: "You have been disqualified from this assessment" },
            { status: 403 }
        );
    }

    // ── Geo-restriction check ────────────────────────────────────────────────
    const settings = await getSettings();
    if (settings.geoRestriction.trim()) {
        const allowed = settings.geoRestriction
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
        const candidateCountry = (candidate.country ?? "").toUpperCase();
        if (!candidateCountry || !allowed.includes(candidateCountry)) {
            return NextResponse.json(
                { error: "geo_restricted" },
                { status: 403 }
            );
        }
    }

    // Question IDs this candidate has already submitted a Response for
    const answered = await prisma.response.findMany({
        where: { candidateId },
        select: { questionId: true },
    });
    const answeredIds = answered.map((r) => r.questionId);

    const next = await prisma.question.findFirst({
        where: {
            campaignId: candidate.campaignId,
            id: { notIn: answeredIds },
        },
        orderBy: { orderIndex: "asc" },
    });

    if (!next) {
        await prisma.candidate.update({
            where: { id: candidateId },
            data: { status: "COMPLETED" },
        });
        return NextResponse.json({ done: true });
    }

    const question: PublicQuestion = {
        id: next.id,
        type: next.type as unknown as QuestionType,
        text: next.text,
        imageUrl: next.imageUrl,
        options: next.options as (string | number)[],
        timeLimitSec: next.timeLimitSec,
        basePoints: next.basePoints,
        // Respect global speed bonus toggle — zero it out if disabled
        speedBonusMax: settings.speedBonusEnabled ? next.speedBonusMax : 0,
        orderIndex: next.orderIndex,
    };

    return NextResponse.json({ done: false, question });
}

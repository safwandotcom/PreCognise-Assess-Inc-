// app/api/admin/campaigns/[id]/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// ── Math helpers ────────────────────────────────────────────────────────────

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mode(nums: number[]): number {
  if (!nums.length) return 0;
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
  let best = nums[0];
  let bestCount = 0;
  for (const [v, c] of freq) {
    if (c > bestCount) { bestCount = c; best = v; }
  }
  return best;
}

function stdDev(nums: number[], avg: number): number {
  if (nums.length < 2) return 0;
  const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        name: true,
        status: true,
        durationSec: true,
        negativeMarking: true,
        negativeMarkingValue: true,
        startedAt: true,
        endedAt: true,
      },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const questions = await prisma.question.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        orderIndex: true,
        text: true,
        type: true,
        basePoints: true,
        speedBonusMax: true,
        timeLimitSec: true,
        options: true,
        correctOption: true,
      },
      orderBy: { orderIndex: "asc" },
    });

    const candidates = await prisma.candidate.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        accessId: true,
        name: true,
        status: true,
        tabSwitchCount: true,
        disqualifyReason: true,
      },
    });

    const responses = await prisma.response.findMany({
      where: { candidate: { campaignId: id } },
      select: {
        candidateId: true,
        questionId: true,
        score: true,
        answer: true,
        responseTimeMs: true,
        question: {
          select: {
            type: true,
            correctOption: true,
            basePoints: true,
          },
        },
      },
    });

    const maxPossible = questions.reduce((s, q) => s + q.basePoints + q.speedBonusMax, 0);
    const scorable = new Set(["mcq", "image"]);

    // ── Per-candidate totals ──────────────────────────────────────────────────

    const respByCandidate = new Map<string, typeof responses>();
    for (const r of responses) {
      const list = respByCandidate.get(r.candidateId) ?? [];
      list.push(r);
      respByCandidate.set(r.candidateId, list);
    }

    interface CandidateTotals {
      rawScore: number;
      totalScore: number;
      correctCount: number;
      answeredCount: number;
    }

    const candidateTotals = new Map<string, CandidateTotals>();

    for (const c of candidates) {
      const cRes = respByCandidate.get(c.id) ?? [];
      const rawScore = cRes.reduce((s, r) => s + r.score, 0);
      const correctCount = cRes.filter(r => r.score > 0 && scorable.has(r.question.type)).length;

      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cRes) {
          if (r.answer !== null && r.score === 0 && scorable.has(r.question.type)) {
            if (r.question.correctOption !== null && r.answer !== r.question.correctOption) {
              penalty += r.question.basePoints * campaign.negativeMarkingValue;
            }
          }
        }
      }

      candidateTotals.set(c.id, {
        rawScore,
        totalScore: Math.max(0, rawScore - penalty),
        correctCount,
        answeredCount: cRes.length,
      });
    }

    // ── Candidate participation stats ─────────────────────────────────────────

    const total = candidates.length;
    const completed = candidates.filter(c => c.status === "COMPLETED").length;
    const disqualified = candidates.filter(c => c.status === "DISQUALIFIED").length;
    const noShow = candidates.filter(c => ["REGISTERED", "JOINED"].includes(c.status)).length;
    const totalTabSwitches = candidates.reduce((s, c) => s + c.tabSwitchCount, 0);

    const disqualifyReasonMap = new Map<string, number>();
    for (const c of candidates.filter(c => c.status === "DISQUALIFIED")) {
      const key = c.disqualifyReason?.includes("duplicate") || c.disqualifyReason?.includes("Duplicate")
        ? "Duplicate login"
        : c.disqualifyReason?.includes("tab") || c.disqualifyReason?.includes("Tab")
        ? "Tab switching"
        : c.disqualifyReason ?? "Other";
      disqualifyReasonMap.set(key, (disqualifyReasonMap.get(key) ?? 0) + 1);
    }
    const disqualifyReasons = Array.from(disqualifyReasonMap.entries()).map(([reason, count]) => ({ reason, count }));

    // ── Score stats (completed candidates only) ───────────────────────────────

    const completedScores = candidates
      .filter(c => c.status === "COMPLETED")
      .map(c => candidateTotals.get(c.id)?.totalScore ?? 0)
      .sort((a, b) => a - b);

    const scoreMean = Math.round(mean(completedScores) * 10) / 10;
    const scoreMedian = Math.round(median(completedScores) * 10) / 10;
    const scoreMode = mode(completedScores.map(s => Math.round(s)));
    const scoreStdDev = Math.round(stdDev(completedScores, scoreMean) * 10) / 10;
    const scoreMin = completedScores[0] ?? 0;
    const scoreMax = completedScores[completedScores.length - 1] ?? 0;
    const p25 = Math.round(percentile(completedScores, 25) * 10) / 10;
    const p75 = Math.round(percentile(completedScores, 75) * 10) / 10;
    const passThreshold = maxPossible * 0.6;
    const passCount = completedScores.filter(s => s >= passThreshold).length;
    const passRate = completed > 0 ? Math.round((passCount / completed) * 1000) / 10 : 0;

    // ── Score distribution (5 buckets by % of max) ────────────────────────────

    const bucketLabels = ["0–20%", "21–40%", "41–60%", "61–80%", "81–100%"];
    const buckets = [0, 0, 0, 0, 0];
    for (const s of completedScores) {
      const pct = maxPossible > 0 ? (s / maxPossible) * 100 : 0;
      const idx = Math.min(4, Math.floor(pct / 20));
      buckets[idx]++;
    }
    const distribution = bucketLabels.map((label, i) => ({ label, count: buckets[i] }));

    // ── Per-question analytics ─────────────────────────────────────────────────

    const respByQuestion = new Map<string, typeof responses>();
    for (const r of responses) {
      const list = respByQuestion.get(r.questionId) ?? [];
      list.push(r);
      respByQuestion.set(r.questionId, list);
    }

    // Discrimination index: split candidates by score into top/bottom halves
    const sortedCandidatesByScore = candidates
      .filter(c => c.status === "COMPLETED")
      .map(c => ({ id: c.id, score: candidateTotals.get(c.id)?.totalScore ?? 0 }))
      .sort((a, b) => b.score - a.score);

    const half = Math.floor(sortedCandidatesByScore.length / 2);
    const topHalf = new Set(sortedCandidatesByScore.slice(0, half).map(c => c.id));
    const bottomHalf = new Set(sortedCandidatesByScore.slice(half).map(c => c.id));

    const questionAnalytics = questions.map(q => {
      const qRes = respByQuestion.get(q.id) ?? [];
      const answered = qRes.length;
      const correct = qRes.filter(r => r.score > 0 && scorable.has(q.type)).length;
      const pValue = answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0;
      const avgResponseMs = answered > 0
        ? Math.round(mean(qRes.map(r => r.responseTimeMs)))
        : 0;
      const timeoutCount = qRes.filter(r => r.responseTimeMs >= q.timeLimitSec * 1000 * 0.98).length;

      // Option frequency for MCQ/image
      let optionFrequency: number[] | null = null;
      if ((q.type === "mcq" || q.type === "image") && Array.isArray(q.options)) {
        optionFrequency = (q.options as unknown[]).map((_, idx) =>
          qRes.filter(r => r.answer === idx).length
        );
      }

      // Discrimination index
      let discriminationIndex = 0;
      if (topHalf.size > 0 && bottomHalf.size > 0) {
        const topCorrect = qRes.filter(r => topHalf.has(r.candidateId) && r.score > 0 && scorable.has(q.type)).length;
        const bottomCorrect = qRes.filter(r => bottomHalf.has(r.candidateId) && r.score > 0 && scorable.has(q.type)).length;
        discriminationIndex = Math.round(
          ((topCorrect / topHalf.size) - (bottomCorrect / bottomHalf.size)) * 100
        ) / 100;
      }

      return {
        id: q.id,
        orderIndex: q.orderIndex,
        text: q.text,
        type: q.type,
        basePoints: q.basePoints,
        timeLimitSec: q.timeLimitSec,
        totalAnswered: answered,
        correctCount: correct,
        pValue,
        avgResponseMs,
        timeoutCount,
        optionFrequency,
        discriminationIndex,
      };
    });

    // ── Test difficulty assessment ─────────────────────────────────────────────

    const difficultyScore = maxPossible > 0
      ? Math.round((1 - scoreMean / maxPossible) * 100)
      : 50;

    const difficulty =
      difficultyScore < 30 ? "Easy"
      : difficultyScore < 50 ? "Moderate"
      : difficultyScore < 70 ? "Hard"
      : "Very Hard";

    const scorableQs = questionAnalytics.filter(q => q.type === "mcq" || q.type === "image");
    const easiest = scorableQs.length
      ? scorableQs.reduce((a, b) => a.pValue > b.pValue ? a : b)
      : null;
    const hardest = scorableQs.length
      ? scorableQs.reduce((a, b) => a.pValue < b.pValue ? a : b)
      : null;
    const slowest = questionAnalytics.length
      ? questionAnalytics.reduce((a, b) => a.avgResponseMs > b.avgResponseMs ? a : b)
      : null;

    // ── Integrity stats ───────────────────────────────────────────────────────

    const disqForTab = disqualifyReasons.find(r => r.reason === "Tab switching")?.count ?? 0;
    const disqForDup = disqualifyReasons.find(r => r.reason === "Duplicate login")?.count ?? 0;
    const highRiskCandidates = candidates.filter(c => c.tabSwitchCount > 0).length;

    return NextResponse.json({
      campaign: {
        name: campaign.name,
        status: campaign.status,
        durationSec: campaign.durationSec,
        negativeMarking: campaign.negativeMarking,
        startedAt: campaign.startedAt?.toISOString() ?? null,
        endedAt: campaign.endedAt?.toISOString() ?? null,
      },
      maxPossible,
      totalQuestions: questions.length,

      scoreStats: {
        count: completed,
        mean: scoreMean,
        median: scoreMedian,
        mode: scoreMode,
        stdDev: scoreStdDev,
        min: scoreMin,
        max: scoreMax,
        p25,
        p75,
        passRate,
        passThreshold: Math.round(passThreshold),
      },

      candidateStats: {
        total,
        completed,
        disqualified,
        noShow,
        completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
        totalTabSwitches,
        avgTabSwitches: total > 0 ? Math.round((totalTabSwitches / total) * 10) / 10 : 0,
        disqualifyReasons,
      },

      distribution,

      questions: questionAnalytics,

      testAssessment: {
        difficulty,
        difficultyScore,
        easiest: easiest ? { text: easiest.text, pValue: easiest.pValue } : null,
        hardest: hardest ? { text: hardest.text, pValue: hardest.pValue } : null,
        slowest: slowest ? { text: slowest.text, avgMs: slowest.avgResponseMs } : null,
      },

      integrityStats: {
        totalTabSwitches,
        avgTabSwitchesPerCandidate: total > 0 ? Math.round((totalTabSwitches / total) * 10) / 10 : 0,
        highRiskCount: highRiskCandidates,
        disqualifiedForTabSwitch: disqForTab,
        disqualifiedForDuplicateLogin: disqForDup,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id]/analytics error:", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

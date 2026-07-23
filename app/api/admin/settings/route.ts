import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/get-settings";
import { getOwnerId } from "@/lib/tenant";

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const settings = await getSettings(ownerId);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("GET /api/admin/settings error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const {
      antiCheatTabSwitch,
      antiCheatContextMenu,
      antiCheatCopyPaste,
      antiCheatScreenshot,
      antiCheatDevTools,
      speedBonusEnabled,
      gracePeriodSec,
      geoRestriction,
    } = body;

    const existing = await prisma.assessmentSettings.findFirst({ where: { ownerId } });

    const data = {
      antiCheatTabSwitch: Boolean(antiCheatTabSwitch),
      antiCheatContextMenu: Boolean(antiCheatContextMenu),
      antiCheatCopyPaste: Boolean(antiCheatCopyPaste),
      antiCheatScreenshot: Boolean(antiCheatScreenshot),
      antiCheatDevTools: Boolean(antiCheatDevTools),
      speedBonusEnabled: Boolean(speedBonusEnabled),
      gracePeriodSec: Math.max(0, Math.min(30, Number(gracePeriodSec ?? 0))),
      geoRestriction: (geoRestriction ?? "").trim(),
    };

    const settings = existing
      ? await prisma.assessmentSettings.update({ where: { id: existing.id }, data })
      : await prisma.assessmentSettings.create({ data: { ...data, ownerId } });

    return NextResponse.json({ settings });
  } catch (err) {
    console.error("PUT /api/admin/settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

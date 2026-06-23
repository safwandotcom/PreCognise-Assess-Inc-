import { prisma } from "@/lib/prisma";

export type AssessmentSettings = {
  antiCheatTabSwitch: boolean;
  antiCheatContextMenu: boolean;
  antiCheatCopyPaste: boolean;
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  speedBonusEnabled: boolean;
  gracePeriodSec: number;
  geoRestriction: string;
};

export const SETTINGS_DEFAULTS: AssessmentSettings = {
  antiCheatTabSwitch: true,
  antiCheatContextMenu: true,
  antiCheatCopyPaste: true,
  antiCheatScreenshot: true,
  antiCheatDevTools: true,
  speedBonusEnabled: true,
  gracePeriodSec: 0,
  geoRestriction: "",
};

export async function getSettings(): Promise<AssessmentSettings> {
  let row = await prisma.assessmentSettings.findFirst();
  if (!row) {
    row = await prisma.assessmentSettings.create({ data: {} });
  }
  return {
    antiCheatTabSwitch: row.antiCheatTabSwitch,
    antiCheatContextMenu: row.antiCheatContextMenu,
    antiCheatCopyPaste: row.antiCheatCopyPaste,
    antiCheatScreenshot: row.antiCheatScreenshot,
    antiCheatDevTools: row.antiCheatDevTools,
    speedBonusEnabled: row.speedBonusEnabled,
    gracePeriodSec: row.gracePeriodSec,
    geoRestriction: row.geoRestriction,
  };
}

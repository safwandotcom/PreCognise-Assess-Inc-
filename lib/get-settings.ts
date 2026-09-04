import { prisma } from "@/lib/prisma";

export type AssessmentSettings = {
  antiCheatTabSwitch: boolean;
  antiCheatContextMenu: boolean;
  antiCheatCopyPaste: boolean;
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  antiCheatCamera: boolean;
  antiCheatMultiDisplay: boolean;
  speedBonusEnabled: boolean;
  gracePeriodSec: number;
  geoRestriction: string;
  tabSwitchLimit: number;
  antiCheatFullscreen: boolean;
  antiCheatRightClick: boolean;
  autoDisqualifyOnViolation: boolean;
};

export const SETTINGS_DEFAULTS: AssessmentSettings = {
  antiCheatTabSwitch: true,
  antiCheatContextMenu: true,
  antiCheatCopyPaste: true,
  antiCheatScreenshot: true,
  antiCheatDevTools: true,
  antiCheatCamera: false,
  antiCheatMultiDisplay: false,
  speedBonusEnabled: true,
  gracePeriodSec: 0,
  geoRestriction: "",
  tabSwitchLimit: 3,
  antiCheatFullscreen: false,
  antiCheatRightClick: true,
  autoDisqualifyOnViolation: true,
};

export async function getSettings(ownerId: string): Promise<AssessmentSettings> {
  // No owner context (e.g. a legacy campaign with a null ownerId) → return
  // safe defaults rather than minting an empty-keyed settings row.
  if (!ownerId) {
    return { ...SETTINGS_DEFAULTS };
  }
  let row = await prisma.assessmentSettings.findFirst({ where: { ownerId } });
  if (!row) {
    row = await prisma.assessmentSettings.create({ data: { ownerId } });
  }
  return {
    antiCheatTabSwitch: row.antiCheatTabSwitch,
    antiCheatContextMenu: row.antiCheatContextMenu,
    antiCheatCopyPaste: row.antiCheatCopyPaste,
    antiCheatScreenshot: row.antiCheatScreenshot,
    antiCheatDevTools: row.antiCheatDevTools,
    antiCheatCamera: SETTINGS_DEFAULTS.antiCheatCamera,
    antiCheatMultiDisplay: SETTINGS_DEFAULTS.antiCheatMultiDisplay,
    speedBonusEnabled: row.speedBonusEnabled,
    gracePeriodSec: row.gracePeriodSec,
    geoRestriction: row.geoRestriction,
    tabSwitchLimit: SETTINGS_DEFAULTS.tabSwitchLimit,
    antiCheatFullscreen: SETTINGS_DEFAULTS.antiCheatFullscreen,
    antiCheatRightClick: SETTINGS_DEFAULTS.antiCheatRightClick,
    autoDisqualifyOnViolation: SETTINGS_DEFAULTS.autoDisqualifyOnViolation,
  };
}

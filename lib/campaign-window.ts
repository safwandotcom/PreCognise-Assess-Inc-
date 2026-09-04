export interface CampaignWindow {
  scheduledAt: Date | null;
  scheduledEnd: Date | null;
  gracePeriodMin: number;
  durationSec: number;
}

/**
 * The instant after which a campaign no longer accepts any activity — new
 * joins are rejected and any exam already in progress is force-ended.
 *
 * - `scheduledEnd` set: that's the answer, full stop.
 * - `scheduledEnd` unset: falls back to the legacy `scheduledAt +
 *   gracePeriodMin` model, preserving its `gracePeriodMin === 0` ⇒ "never
 *   closes" convention.
 */
export function campaignCloseAt(
  campaign: Pick<CampaignWindow, "scheduledAt" | "scheduledEnd" | "gracePeriodMin">,
): Date | null {
  if (campaign.scheduledEnd) return campaign.scheduledEnd;
  if (!campaign.scheduledAt || campaign.gracePeriodMin === 0) return null;
  return new Date(campaign.scheduledAt.getTime() + campaign.gracePeriodMin * 60_000);
}

/**
 * The last instant a *new* candidate may join. Equal to campaignCloseAt()
 * unless `scheduledEnd` is set, in which case it's pulled earlier by the
 * campaign's current total question duration, so a joiner can still finish
 * before the window closes.
 */
export function campaignLastEntryAt(campaign: CampaignWindow): Date | null {
  if (campaign.scheduledEnd) {
    return new Date(campaign.scheduledEnd.getTime() - campaign.durationSec * 1000);
  }
  return campaignCloseAt(campaign);
}

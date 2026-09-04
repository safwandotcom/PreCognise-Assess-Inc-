export interface CampaignWindow {
  scheduledEnd: Date | null;
  durationSec: number;
  startedAt: Date | null;
  gracePeriodMin: number;
}

/**
 * The instant after which a campaign no longer accepts any activity — new
 * joins are rejected and any exam already in progress is force-ended.
 *
 * Only fires for campaigns that set `scheduledEnd`. Legacy campaigns
 * (scheduledEnd unset) have NO hard cutoff — gracePeriodMin has never
 * bounded exam duration, only new-candidate entry, and must not start now.
 */
export function campaignCloseAt(
  campaign: Pick<CampaignWindow, "scheduledEnd">,
): Date | null {
  return campaign.scheduledEnd;
}

/**
 * The last instant a *new* candidate may join. Equal to campaignCloseAt()
 * minus the campaign's current total question duration when scheduledEnd
 * is set. Otherwise falls back to the pre-existing JoinGate rule: measured
 * from `startedAt` (when the campaign actually went live, not
 * `scheduledAt`), with `gracePeriodMin === 0` still meaning "never closes."
 */
export function campaignLastEntryAt(campaign: CampaignWindow): Date | null {
  if (campaign.scheduledEnd) {
    return new Date(campaign.scheduledEnd.getTime() - campaign.durationSec * 1000);
  }
  if (!campaign.startedAt || campaign.gracePeriodMin === 0) return null;
  return new Date(campaign.startedAt.getTime() + campaign.gracePeriodMin * 60_000);
}

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Not started",
  SCHEDULED: "Scheduled",
  LIVE: "Live now",
  PAUSED: "Paused",
  ENDED: "Ended",
};

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  JOINED: "Joined",
  ACTIVE: "In progress",
  COMPLETED: "Completed",
  DISQUALIFIED: "Disqualified",
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status] ?? status;
}

export function candidateStatusLabel(status: string): string {
  return CANDIDATE_STATUS_LABELS[status] ?? status;
}

"use client";

import { useEffect, useState } from "react";

export interface Branding {
  orgName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColour: string;
  bgColor: string;
}

const DEFAULT: Branding = {
  orgName: "PreCognize",
  tagline: "Candidate Assessment",
  logoUrl: null,
  primaryColour: "#6366F1",
  bgColor: "#F8FAFC",
};

export function useBranding(joinToken?: string): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULT);

  useEffect(() => {
    const url = joinToken ? `/api/branding?token=${encodeURIComponent(joinToken)}` : "/api/branding";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setBranding({ ...DEFAULT, ...data }))
      .catch(() => {});
  }, [joinToken]);

  return branding;
}

"use client";

import { useEffect, useState } from "react";

export interface Branding {
  orgName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColour: string;
}

const DEFAULT: Branding = {
  orgName: "PreCognise",
  tagline: "Candidate Assessment",
  logoUrl: null,
  primaryColour: "#2E0BFC",
};

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULT);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => setBranding({ ...DEFAULT, ...data }))
      .catch(() => {});
  }, []);

  return branding;
}

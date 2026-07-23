"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-store";

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
    let url = "/api/branding";
    let init: RequestInit | undefined;
    if (joinToken) {
      url = `/api/branding?token=${encodeURIComponent(joinToken)}`;
    } else {
      const jwt = getToken();
      if (jwt) {
        init = { headers: { Authorization: `Bearer ${jwt}` } };
      }
    }
    fetch(url, init)
      .then((r) => r.json())
      .then((data) => setBranding({ ...DEFAULT, ...data }))
      .catch(() => {});
  }, [joinToken]);

  return branding;
}

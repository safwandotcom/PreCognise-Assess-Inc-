"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /admin/campaigns/[id]/edit — thin redirect shim.
 * Campaign editing is handled inline on the Manage page (/admin/campaigns/[id]).
 */
export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/campaigns/${id}`);
  }, [id, router]);

  return null;
}

import { NextResponse } from "next/server";
import { getSettings, SETTINGS_DEFAULTS } from "@/lib/get-settings";

// Public — no auth. Exam page and waiting room fetch this on mount.
export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings, {
      headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=30" },
    });
  } catch (err) {
    console.error("GET /api/settings error:", err);
    // Return safe defaults on error so the exam page is never blocked
    return NextResponse.json(SETTINGS_DEFAULTS);
  }
}

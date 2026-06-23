"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBranding } from "@/lib/use-branding";

export default function CandidateLoginPage() {
  const router = useRouter();
  const branding = useBranding();

  const [rollNumber, setRollNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!rollNumber || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        setIsLoading(false);
        return;
      }

      sessionStorage.setItem("rollNumber", rollNumber);
      router.push("/candidate/verify-otp");
    } catch (err) {
      console.error("login submit error:", err);
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2E0BFC] focus:bg-white focus:ring-1 focus:ring-[#2E0BFC]";

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-6 overflow-hidden rounded-2xl text-center"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
        >
          <div className="px-6 py-7">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.orgName}
                className="mx-auto mb-2 h-8 max-w-[180px] object-contain"
              />
            ) : (
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <span className="text-lg font-bold text-white">
                  {branding.orgName.charAt(0)}
                </span>
              </div>
            )}
            <h1 className="text-lg font-bold text-white">{branding.orgName}</h1>
            <p className="mt-0.5 text-sm text-white/70">{branding.tagline}</p>
          </div>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-[#0F172A]">Candidate sign in</h2>
          <p className="mb-5 text-xs text-[#64748B]">Enter your credentials to access the assessment.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Roll Number</label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                className={inputCls}
                placeholder="e.g. PC-2026-001"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
            >
              {isLoading ? "Sending OTP..." : "Continue →"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-[#94A3B8]">
          Assessment platform by {branding.orgName}
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setToken } from "@/lib/auth-store";
import { useBranding } from "@/lib/use-branding";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const joinToken = params.get("token") ?? "";
  const branding = useBranding(joinToken);

  const [accessId, setAccessId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, password, joinToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      setToken(data.token);
      if (data.candidateName) {
        sessionStorage.setItem("candidateName", data.candidateName);
      }
      router.replace("/candidate/waiting-room");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl mb-3"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
          >
            <span className="text-xl font-bold text-white">{branding.orgName.charAt(0)}</span>
          </div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#64748B]">{branding.orgName}</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#0F172A] mb-6">Candidate Login</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Access ID</label>
              <input
                type="text"
                value={accessId}
                onChange={e => setAccessId(e.target.value.toUpperCase())}
                placeholder="RELA-000001"
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#6366F1] py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <div className="text-right">
              <Link
                href={joinToken ? `/candidate/forgot-password?token=${joinToken}` : "/candidate/forgot-password"}
                className="text-xs text-[#64748B] hover:text-[#6366F1] hover:underline underline-offset-2"
              >
                Forgot your password?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function CandidateLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

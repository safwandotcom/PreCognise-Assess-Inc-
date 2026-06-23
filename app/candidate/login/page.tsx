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

  return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.orgName}
              className="mx-auto mb-3 h-10 max-w-[200px] object-contain"
            />
          ) : (
            <h1 className="text-3xl font-bold text-white tracking-tight">{branding.orgName}</h1>
          )}
          <p className="text-gray-400 text-sm mt-1">{branding.tagline}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-gray-300 mb-1">Roll Number</label>
            <input
              type="text"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": branding.primaryColour } as React.CSSProperties}
              placeholder="e.g. PC-2026-001"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2"
              placeholder="you@example.com"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2"
              placeholder="••••••••"
              autoComplete="off"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full text-white font-medium rounded-md py-2 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: branding.primaryColour }}
          >
            {isLoading ? "Sending OTP..." : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

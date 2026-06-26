"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBranding } from "@/lib/use-branding";

type Step = "email" | "otp" | "success";

const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#6366F1] focus:bg-white focus:ring-1 focus:ring-[#6366F1]";

function ForgotPasswordForm() {
  const params = useSearchParams();
  const joinToken = params.get("token") ?? "";
  const branding = useBranding(joinToken);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginHref = joinToken ? `/candidate/login?token=${joinToken}` : "/candidate/login";

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to send code. Please try again.");
        return;
      }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed. Please try again.");
        return;
      }
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken }),
      });
    } catch {
      // non-fatal
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
          {step === "email" && (
            <>
              <h1 className="text-xl font-semibold text-[#0F172A] mb-2">Forgot password?</h1>
              <p className="text-sm text-[#64748B] mb-6">Enter your registered email to receive a 6-digit reset code.</p>
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={inputCls}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
                >
                  {loading ? "Sending…" : "Send reset code →"}
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <h1 className="text-xl font-semibold text-[#0F172A] mb-2">Enter reset code</h1>
              <p className="text-sm text-[#64748B] mb-6">
                A 6-digit code was sent to <strong>{email}</strong>. It expires in 15 minutes.
              </p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Reset code</label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className={`${inputCls} font-mono tracking-widest text-center text-lg`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">New password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Confirm new password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className={inputCls}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
                >
                  {loading ? "Verifying…" : "Reset password →"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="mt-3 w-full text-center text-xs text-[#64748B] hover:text-[#0F172A] disabled:opacity-50"
              >
                Resend code
              </button>
            </>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 border border-green-200">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#0F172A] mb-2">Password updated</h2>
              <p className="text-sm text-[#64748B] mb-6">You can now log in with your new password.</p>
              <Link
                href={loginHref}
                className="inline-block w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center"
                style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
              >
                Go to login →
              </Link>
            </div>
          )}
        </div>

        {step !== "success" && (
          <p className="mt-4 text-center text-xs text-[#94A3B8]">
            Remember your password?{" "}
            <Link href={loginHref} className="text-[#6366F1] hover:underline underline-offset-2">
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}

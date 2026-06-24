"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth-store";

const OTP_LENGTH = 6;

export default function VerifyOtpPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    const digit = value.replace(/[^0-9]/g, "").slice(-1);

    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === OTP_LENGTH - 1) {
      const otp = next.join("");
      if (otp.length === OTP_LENGTH) {
        submitOtp(otp);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function submitOtp(otp: string) {
    setError("");

    const rollNumber = sessionStorage.getItem("rollNumber");
    if (!rollNumber) {
      setError("Session expired. Please login again.");
      return;
    }

    const joinToken = sessionStorage.getItem("joinToken");

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber, otp, ...(joinToken ? { joinToken } : {}) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid OTP");
        setDigits(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
        setIsLoading(false);
        return;
      }

      setToken(data.token);
      sessionStorage.setItem("candidateName", data.name);
      router.push("/candidate/waiting-room");
    } catch (err) {
      console.error("verify-otp submit error:", err);
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg, #2E0BFC 0%, #6366F1 100%)" }}
          >
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#0F172A]">Check your email</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Enter the 6-digit code we sent to your email address.
          </p>
        </div>

        {/* OTP card */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center shadow-sm">
          <div className="flex justify-center gap-2 mb-5">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={isLoading}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="h-14 w-12 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-center text-xl font-bold text-[#0F172A] outline-none transition focus:border-[#2E0BFC] focus:bg-white focus:ring-2 focus:ring-[#2E0BFC]/20 disabled:opacity-50"
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-[#64748B]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2E0BFC] border-t-transparent" />
              Verifying...
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[#94A3B8]">
          Didn&apos;t receive the code? Check your spam folder or contact support.
        </p>
      </div>
    </div>
  );
}

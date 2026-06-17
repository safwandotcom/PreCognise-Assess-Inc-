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

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber, otp }),
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
    <main className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">PreCognise</h1>
        <p className="text-gray-400 text-sm mb-8">
          Enter the 6-digit code sent to your email
        </p>

        <div className="flex justify-center gap-2 mb-6">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={isLoading}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 text-center text-xl font-semibold bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        {isLoading && <p className="text-gray-400 text-sm">Verifying...</p>}
      </div>
    </main>
  );
}
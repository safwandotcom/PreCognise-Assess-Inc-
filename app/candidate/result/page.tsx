"use client";

import { useEffect, useState } from "react";

export default function ResultPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const msg = sessionStorage.getItem("completionMessage");
    const total = sessionStorage.getItem("totalQuestions");
    setMessage(msg);
    if (total) setTotalQuestions(Number(total));
    // Animate in after mount
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div
        className={`w-full max-w-lg text-center transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* Animated checkmark */}
        <div className="mx-auto mb-8 relative flex items-center justify-center">
          <div className="h-28 w-28 rounded-full bg-[#6366F1]/10 flex items-center justify-center ring-1 ring-[#6366F1]/30">
            <div className="h-20 w-20 rounded-full bg-[#6366F1]/20 flex items-center justify-center ring-1 ring-[#6366F1]/50">
              <svg
                className="h-10 w-10 text-[#6366F1]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          {/* Radiating ring animation */}
          <div className="absolute inset-0 rounded-full border border-[#6366F1]/20 animate-ping" style={{ animationDuration: "2.5s" }} />
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
          Assessment Complete
        </h1>

        {totalQuestions !== null && (
          <p className="text-sm text-gray-500 mb-6">
            {totalQuestions} question{totalQuestions !== 1 ? "s" : ""} answered
          </p>
        )}

        {/* Divider */}
        <div className="w-12 h-px bg-[#6366F1]/40 mx-auto mb-6" />

        {/* Custom message or default */}
        <p className="text-gray-300 text-base leading-relaxed whitespace-pre-line">
          {message ??
            "Thank you for completing the assessment. Results will be communicated to you shortly."}
        </p>

        {/* Bottom note */}
        <p className="mt-10 text-xs text-gray-600">
          You may now close this window.
        </p>
      </div>
    </div>
  );
}

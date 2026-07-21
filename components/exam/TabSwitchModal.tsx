// components/exam/TabSwitchModal.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  count: number;
  limit: number;
  onClose: () => void;
}

export default function TabSwitchModal({ count, limit, onClose }: Props) {
  const [seconds, setSeconds] = useState(10);
  const remaining = Math.max(limit - count, 0);

  useEffect(() => {
    if (seconds === 0) { onClose(); return; }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-yellow-500 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-yellow-400 text-xl font-bold mb-2">Tab Switch Detected</h2>
        <p className="text-gray-300 mb-6">
          Warning: you switched tabs (<span className="text-yellow-400 font-semibold">{count} of {limit} allowed</span>).{" "}
          {remaining > 0
            ? `${remaining} more will end your exam automatically.`
            : "One more will end your exam automatically."}
        </p>
        <div className="text-5xl font-mono font-bold text-yellow-400">{seconds}</div>
        <p className="text-gray-500 text-sm mt-2">This warning closes automatically</p>
      </div>
    </div>
  );
}

// components/exam/TabSwitchModal.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  onClose: () => void;
}

export default function TabSwitchModal({ onClose }: Props) {
  const [count, setCount] = useState(10);

  useEffect(() => {
    if (count === 0) { onClose(); return; }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-yellow-500 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-yellow-400 text-xl font-bold mb-2">Tab Switch Detected</h2>
        <p className="text-gray-300 mb-6">
          This is your <span className="text-yellow-400 font-semibold">first and final warning</span>.
          Switching tabs again will immediately disqualify you.
        </p>
        <div className="text-5xl font-mono font-bold text-yellow-400">{count}</div>
        <p className="text-gray-500 text-sm mt-2">This warning closes automatically</p>
      </div>
    </div>
  );
}
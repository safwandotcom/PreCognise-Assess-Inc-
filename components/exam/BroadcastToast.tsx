"use client";

import { useEffect, useState } from "react";

interface BroadcastToastProps {
  message: string | null;
  onDismiss: () => void;
}

const VISIBLE_MS = 5000;

export default function BroadcastToast({ message, onDismiss }: BroadcastToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    // Only handle hide + dismiss
    const hideTimer = setTimeout(() => setVisible(false), VISIBLE_MS);
    const clearTimer = setTimeout(() => onDismiss(), VISIBLE_MS + 300);

    // Start visible AFTER mount (next tick)
    setTimeout(() => setVisible(true), 0);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`fixed left-1/2 top-4 z-50 w-[90%] max-w-md -translate-x-1/2 transform rounded-lg border border-blue-500/50 bg-gray-800 px-4 py-3 shadow-lg transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
        Message from admin
      </p>
      <p className="mt-1 text-sm text-gray-100">{message}</p>
    </div>
  );
}
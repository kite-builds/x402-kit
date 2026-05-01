"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "x402-dashboard-auto-refresh";
const DEFAULT_INTERVAL_MS = 5_000;

export function AutoRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(intervalMs / 1000));

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "off") setEnabled(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const tickMs = 1_000;
    const total = Math.max(1, Math.round(intervalMs / tickMs));
    let remaining = total;
    setSecondsLeft(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        router.refresh();
        remaining = total;
      }
      setSecondsLeft(remaining);
    }, tickMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  return (
    <button
      type="button"
      className="auto-refresh"
      onClick={() => setEnabled((v) => !v)}
      aria-pressed={enabled}
      title={enabled ? "Click to pause auto-refresh" : "Click to resume auto-refresh"}
    >
      <span className={`dot ${enabled ? "on" : "off"}`} aria-hidden />
      {enabled ? `auto-refresh in ${secondsLeft}s` : "auto-refresh paused"}
    </button>
  );
}

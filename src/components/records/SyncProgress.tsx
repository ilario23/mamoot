"use client";

import type { SyncState } from "@/hooks/useSyncActivityDetails";
import { Clock } from "lucide-react";

interface SyncProgressProps {
  state: SyncState;
  /** When true, we already have some efforts data to display — use subtle mode */
  hasData?: boolean;
}

const formatCooldown = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const SyncProgress = ({ state, hasData = false }: SyncProgressProps) => {
  const { total, synced, isSyncing, isRateLimited, cooldownSeconds } = state;

  if (total === 0) return null;
  if (synced >= total && !isSyncing) return null;

  // When we already have cached data to show, only surface the banner
  // for rate-limit pauses (the user should know why progress stalled).
  // Otherwise let the sync run silently in the background.
  if (hasData && !isRateLimited) return null;

  const percent = total > 0 ? Math.round((synced / total) * 100) : 0;

  // Rate-limited banner — always shown so the user knows why it stalled
  if (isRateLimited) {
    return (
      <div
        className="border-3 border-border bg-background p-4 shadow-neo"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-sm font-black uppercase tracking-wider">
              Rate Limit Reached
            </span>
          </div>
          <span className="text-sm font-bold text-muted-foreground">
            {synced} / {total}
          </span>
        </div>
        <div className="h-3 border-2 border-border bg-muted overflow-hidden">
          <div className="h-full transition-all duration-500 bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2">
          <p className="text-xs font-bold text-muted-foreground">
            Strava API rate limit reached. Resuming in{" "}
            <span className="font-black text-foreground">
              {formatCooldown(cooldownSeconds)}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // First-ever sync (no cached data yet) — full progress banner
  return (
    <div
      className="border-3 border-border bg-background p-4 shadow-neo"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-end gap-px" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1 h-3 bg-primary animate-neo-blocks" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </span>
          <span className="text-sm font-black uppercase tracking-wider">
            First Sync
          </span>
        </div>
        <span className="text-sm font-bold text-muted-foreground">
          {synced} / {total}
        </span>
      </div>
      <div className="h-3 border-2 border-border bg-muted overflow-hidden">
        <div className="h-full transition-all duration-500 bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2">
        <p className="text-xs font-bold text-muted-foreground">
          Fetching activity details from Strava. This only happens once.
        </p>
      </div>
    </div>
  );
};

export default SyncProgress;

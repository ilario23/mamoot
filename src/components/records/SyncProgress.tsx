"use client";

import type { SyncState } from "@/hooks/useSyncActivityDetails";
import { Loader2, Clock, CheckCircle2 } from "lucide-react";

interface SyncProgressProps {
  state: SyncState;
}

const formatCooldown = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const SyncProgress = ({ state }: SyncProgressProps) => {
  const { total, synced, isSyncing, isRateLimited, cooldownSeconds } = state;

  // Nothing to show if total is 0 or sync hasn't started
  if (total === 0) return null;

  const percent = total > 0 ? Math.round((synced / total) * 100) : 0;
  const isDone = synced >= total && !isSyncing;

  return (
    <div
      className="border-3 border-border bg-background p-4 shadow-neo"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          ) : isRateLimited ? (
            <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          <span className="text-sm font-black uppercase tracking-wider">
            {isDone
              ? "Activities Synced"
              : isRateLimited
                ? "Rate Limit Reached"
                : "Syncing Activities"}
          </span>
        </div>
        <span className="text-sm font-bold text-muted-foreground">
          {synced} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-3 border-2 border-border bg-muted overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isDone
              ? "bg-green-500"
              : isRateLimited
                ? "bg-accent"
                : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Status message */}
      <div className="mt-2">
        {isDone ? (
          <p className="text-xs font-bold text-muted-foreground">
            All activity details are cached. Records are up to date.
          </p>
        ) : isRateLimited ? (
          <p className="text-xs font-bold text-muted-foreground">
            Strava API rate limit reached. Resuming in{" "}
            <span className="font-black text-foreground">
              {formatCooldown(cooldownSeconds)}
            </span>
          </p>
        ) : (
          <p className="text-xs font-bold text-muted-foreground">
            Fetching activity details for accurate records. This may take a few
            minutes on first sync.
          </p>
        )}
      </div>
    </div>
  );
};

export default SyncProgress;

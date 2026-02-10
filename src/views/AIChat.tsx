"use client";

import Link from "next/link";
import { Target, Pencil } from "lucide-react";
import AITeamChat from "@/components/layout/AITeamChat";
import { useSettings } from "@/contexts/SettingsContext";

const AIChat = () => {
  const { settings } = useSettings();
  const goal = settings.goal?.trim();

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-3rem)] max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3 mb-4">
        AI Team
      </h1>

      {/* Goal banner */}
      <Link
        href="/settings"
        tabIndex={0}
        aria-label={goal ? "Edit training goal" : "Set a training goal"}
        className="group mb-3 flex items-center gap-3 border-3 border-border bg-background p-3 shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer"
      >
        <div className="w-8 h-8 bg-primary rounded-full border-3 border-border flex items-center justify-center shadow-neo-sm shrink-0">
          <Target className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-black text-[10px] uppercase tracking-wider text-muted-foreground block">
            Training Goal
          </span>
          {goal ? (
            <span className="font-bold text-sm truncate block">{goal}</span>
          ) : (
            <span className="font-medium text-sm text-muted-foreground italic block">
              No goal set — tap to add one
            </span>
          )}
        </div>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
      </Link>

      <div className="flex-1 border-3 border-border bg-background shadow-neo overflow-hidden">
        <AITeamChat />
      </div>
    </div>
  );
};

export default AIChat;

"use client";

import AITeamChat from "@/components/layout/AITeamChat";

const AIChat = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-3rem)] max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
        AI Team
      </h1>
      <div className="flex-1 border-3 border-foreground bg-background shadow-neo overflow-hidden">
        <AITeamChat />
      </div>
    </div>
  );
};

export default AIChat;

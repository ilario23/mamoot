"use client";

import { useState, useRef, useEffect } from "react";
import { Dumbbell, Apple, Stethoscope, Send, type LucideIcon } from "lucide-react";
import { aiConversations, aiMockResponses, AIMessage } from "@/lib/mockData";

interface Persona {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

const personas: Persona[] = [
  { id: "coach", label: "Coach", icon: Dumbbell, color: "bg-secondary" },
  { id: "nutritionist", label: "Nutrition", icon: Apple, color: "bg-zone-1" },
  { id: "physio", label: "Physio", icon: Stethoscope, color: "bg-destructive" },
];

const PersonaAvatar = ({ persona, size = "sm" }: { persona: Persona; size?: "sm" | "md" }) => {
  const sizeClasses = size === "md" ? "w-9 h-9" : "w-7 h-7";
  const iconSize = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div
      className={`${sizeClasses} ${persona.color} rounded-full border-3 border-foreground flex items-center justify-center shadow-neo-sm shrink-0`}
    >
      <persona.icon className={`${iconSize} text-foreground`} />
    </div>
  );
};

const AITeamChat = () => {
  const [activePersona, setActivePersona] = useState("coach");
  const [userMessages, setUserMessages] = useState<Record<string, AIMessage[]>>({});
  const [input, setInput] = useState("");
  const [responseIdx, setResponseIdx] = useState<Record<string, number>>({
    coach: 0,
    nutritionist: 0,
    physio: 0,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentPersona = personas.find((p) => p.id === activePersona) ?? personas[0];

  const allMessages = [
    ...(aiConversations[activePersona] || []),
    ...(userMessages[activePersona] || []),
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const responses = aiMockResponses[activePersona];
    const idx = (responseIdx[activePersona] || 0) % responses.length;
    const aiMsg: AIMessage = {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: responses[idx],
      timestamp: new Date().toISOString(),
    };

    setUserMessages((prev) => ({
      ...prev,
      [activePersona]: [...(prev[activePersona] || []), userMsg, aiMsg],
    }));
    setResponseIdx((prev) => ({
      ...prev,
      [activePersona]: (prev[activePersona] || 0) + 1,
    }));
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Persona selector */}
      <div className="p-3 border-b-3 border-foreground flex gap-2">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePersona(p.id)}
            aria-label={`Switch to ${p.label}`}
            tabIndex={0}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-full border-3 border-foreground font-bold text-xs transition-all ${
              activePersona === p.id
                ? "bg-primary text-primary-foreground shadow-neo-sm"
                : "bg-background hover:bg-muted"
            }`}
          >
            <PersonaAvatar persona={p} size="sm" />
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {allMessages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {!isUser && (
                <PersonaAvatar persona={currentPersona} size="md" />
              )}
              <div
                className={`flex-1 p-3 border-3 border-foreground text-sm font-medium ${
                  isUser ? "bg-muted ml-10" : "bg-accent/20 mr-10"
                }`}
              >
                <span className="font-black text-xs uppercase mb-1 block">
                  {isUser ? "You" : currentPersona.label}
                </span>
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-3 border-t-3 border-foreground flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask your AI team..."
          aria-label="Message input"
          className="flex-1 px-3 py-2 border-3 border-foreground font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSend}
          aria-label="Send message"
          tabIndex={0}
          className="px-4 py-2 bg-foreground text-background font-black text-sm border-3 border-foreground hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
    </div>
  );
};

export default AITeamChat;

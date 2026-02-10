"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Dumbbell, Apple, Stethoscope, Send, Loader2, AlertCircle, ChevronDown, Share2, Check, X, type LucideIcon } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAthleteSummary } from "@/hooks/useAthleteSummary";
import { useCoachPlan } from "@/hooks/useCoachPlan";
import type { PersonaId } from "@/lib/aiPrompts";

// ----- Model options -----

interface ModelOption {
  id: string;
  label: string;
  provider: string;
  tier: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "OpenAI", tier: "Cheapest" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", tier: "Budget" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "OpenAI", tier: "Balanced" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", tier: "Smart" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI", tier: "Smartest" },
  { id: "claude-haiku-3-5", label: "Claude 3.5 Haiku", provider: "Anthropic", tier: "Budget" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic", tier: "Smart" },
];

interface Persona {
  id: PersonaId;
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
      className={`${sizeClasses} ${persona.color} rounded-full border-3 border-border flex items-center justify-center shadow-neo-sm shrink-0`}
    >
      <persona.icon className={`${iconSize} text-foreground`} />
    </div>
  );
};

// ----- Markdown renderer for AI messages -----

const MarkdownContent = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
      li: ({ children }) => <li className="mb-0.5">{children}</li>,
      strong: ({ children }) => <strong className="font-black">{children}</strong>,
      h1: ({ children }) => <h1 className="font-black text-base mb-1">{children}</h1>,
      h2: ({ children }) => <h2 className="font-black text-sm mb-1">{children}</h2>,
      h3: ({ children }) => <h3 className="font-bold text-sm mb-1">{children}</h3>,
      code: ({ children, className }) => {
        const isInline = !className;
        if (isInline) {
          return <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
        }
        return (
          <pre className="bg-muted border-2 border-border p-2 rounded text-xs font-mono overflow-x-auto mb-2">
            <code>{children}</code>
          </pre>
        );
      },
      table: ({ children }) => (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-xs border-3 border-border">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border-2 border-border px-2 py-1 bg-muted font-black text-left">{children}</th>,
      td: ({ children }) => <td className="border-2 border-border px-2 py-1">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>
);

// ----- Chat instance per persona -----

const usePersonaChat = (persona: PersonaId, athleteContext: string | null) => {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
      }),
    [],
  );

  const chat = useChat({
    id: `ai-team-${persona}`,
    transport,
  });

  return chat;
};

// ----- Main component -----

const AITeamChat = () => {
  const [activePersona, setActivePersona] = useState<PersonaId>("coach");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { serialized: athleteContext, isLoading: contextLoading } = useAthleteSummary();
  const { plan: coachPlan, sharePlan, clearPlan } = useCoachPlan();

  // One chat instance per persona
  const coachChat = usePersonaChat("coach", athleteContext);
  const nutritionistChat = usePersonaChat("nutritionist", athleteContext);
  const physioChat = usePersonaChat("physio", athleteContext);

  const chatInstances: Record<PersonaId, ReturnType<typeof useChat>> = useMemo(
    () => ({
      coach: coachChat,
      nutritionist: nutritionistChat,
      physio: physioChat,
    }),
    [coachChat, nutritionistChat, physioChat],
  );

  const activeChat = chatInstances[activePersona];
  const currentPersona = personas.find((p) => p.id === activePersona) ?? personas[0];

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChat.messages.length, activeChat.status]);

  const handleSend = useCallback(() => {
    if (!input.trim() || activeChat.status === "streaming") return;

    activeChat.sendMessage(
      { text: input.trim() },
      {
        body: {
          persona: activePersona,
          athleteContext,
          model: selectedModel,
          coachPlan: activePersona !== "coach" ? coachPlan?.content ?? null : null,
        },
      },
    );
    setInput("");
  }, [input, activeChat, activePersona, athleteContext, selectedModel, coachPlan]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isStreaming = activeChat.status === "streaming";
  const hasError = activeChat.error;

  return (
    <div className="flex flex-col h-full">
      {/* Persona selector */}
      <div className="p-3 border-b-3 border-border flex gap-2">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePersona(p.id)}
            aria-label={`Switch to ${p.label}`}
            tabIndex={0}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-full border-3 border-border font-bold text-xs transition-all ${
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

      {/* Model selector */}
      <div className="px-3 py-2 border-b-3 border-border flex items-center gap-2 bg-muted/30">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">Model</span>
        <div className="relative flex-1">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            aria-label="Select AI model"
            className="w-full appearance-none px-2 py-1 pr-7 border-2 border-border bg-background font-bold text-xs focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.tier}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Context loading indicator */}
      {contextLoading && (
        <div className="px-3 py-2 bg-muted/50 border-b-3 border-border flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading your training data...
        </div>
      )}

      {/* Shared coach plan banner — shown on Nutritionist & Physio tabs */}
      {activePersona !== "coach" && coachPlan && (
        <div className="px-3 py-2 bg-primary/10 border-b-3 border-border flex items-center justify-between gap-2 text-xs font-bold">
          <span className="flex items-center gap-1.5 text-foreground">
            <Dumbbell className="h-3 w-3 shrink-0" />
            Coach plan shared
            <span className="text-muted-foreground font-medium">
              — {new Date(coachPlan.sharedAt).toLocaleDateString()}
            </span>
          </span>
          <button
            onClick={clearPlan}
            aria-label="Clear shared coach plan"
            tabIndex={0}
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3 w-3" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeChat.messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-medium">
            <div className="text-center space-y-2">
              <PersonaAvatar persona={currentPersona} size="md" />
              <p className="font-bold">{currentPersona.label}</p>
              <p className="text-xs max-w-[200px]">
                {activePersona === "coach" && "Ask about training plans, workouts, and race strategy"}
                {activePersona === "nutritionist" && "Ask about fueling, hydration, and recovery nutrition"}
                {activePersona === "physio" && "Ask about injury prevention, mobility, and recovery"}
              </p>
            </div>
          </div>
        )}

        {activeChat.messages.map((msg) => {
          const isUser = msg.role === "user";
          const textContent = msg.parts
            ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("") ?? "";

          if (!textContent) return null;

          const isSharedPlan = !isUser && activePersona === "coach" && coachPlan?.content === textContent;

          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {!isUser && (
                <PersonaAvatar persona={currentPersona} size="md" />
              )}
              <div
                className={`flex-1 p-3 border-3 border-border text-sm font-medium ${
                  isUser ? "bg-muted ml-10" : "bg-accent/20 mr-10"
                } ${isSharedPlan ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-black text-xs uppercase mb-1 block">
                  {isUser ? "You" : currentPersona.label}
                </span>
                {isUser ? (
                  textContent
                ) : (
                  <div className="prose-sm">
                    <MarkdownContent content={textContent} />
                  </div>
                )}
                {/* Share with team button — coach assistant messages only */}
                {!isUser && activePersona === "coach" && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5">
                    {isSharedPlan ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary">
                        <Check className="h-3 w-3" />
                        Shared with team
                      </span>
                    ) : (
                      <button
                        onClick={() => sharePlan(textContent)}
                        aria-label="Share this plan with Nutrition and Physio"
                        tabIndex={0}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Share2 className="h-3 w-3" />
                        Share with team
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && activeChat.messages.length > 0 && activeChat.messages[activeChat.messages.length - 1]?.role === "user" && (
          <div className="flex gap-2 flex-row">
            <PersonaAvatar persona={currentPersona} size="md" />
            <div className="p-3 border-3 border-border text-sm font-medium bg-accent/20 mr-10">
              <span className="font-black text-xs uppercase mb-1 block">{currentPersona.label}</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {hasError && (
        <div className="px-3 py-2 bg-destructive/10 border-t-3 border-border flex items-center gap-2 text-xs text-destructive font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {activeChat.error?.message ?? "Something went wrong. Please try again."}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t-3 border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Waiting for response..." : "Ask your AI team..."}
          disabled={isStreaming}
          aria-label="Message input"
          className="flex-1 px-3 py-2 border-3 border-border font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          aria-label="Send message"
          tabIndex={0}
          className="px-4 py-2 bg-foreground text-background font-black text-sm border-3 border-border hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{isStreaming ? "..." : "Send"}</span>
        </button>
      </div>
    </div>
  );
};

export default AITeamChat;

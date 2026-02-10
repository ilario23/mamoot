"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Dumbbell,
  Apple,
  Stethoscope,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  Share2,
  Check,
  X,
  Plus,
  MessageSquare,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAthleteSummary } from "@/hooks/useAthleteSummary";
import { useCoachPlan } from "@/hooks/useCoachPlan";
import { useChatSessions } from "@/hooks/useChatSessions";
import { useChatPersistence, MAX_MESSAGES_IN_CONTEXT } from "@/hooks/useChatPersistence";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
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

// ----- Session-aware chat instance -----

const usePersistentChat = (sessionId: string | null) => {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
      }),
    [],
  );

  const chat = useChat({
    id: sessionId ? `session-${sessionId}` : "ai-team-pending",
    transport,
  });

  return chat;
};

// ----- Main component -----

const AITeamChat = () => {
  const [activePersona, setActivePersona] = useState<PersonaId>("coach");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { athlete } = useStravaAuth();
  const { serialized: athleteContext, isLoading: contextLoading } = useAthleteSummary();
  const athleteId = athlete?.id ?? null;
  const { plan: coachPlan, sharePlan, clearPlan } = useCoachPlan(athleteId);

  // Session management per persona
  const coachSessions = useChatSessions(athleteId, "coach");
  const nutritionistSessions = useChatSessions(athleteId, "nutritionist");
  const physioSessions = useChatSessions(athleteId, "physio");

  const sessionManagers = useMemo(
    () => ({
      coach: coachSessions,
      nutritionist: nutritionistSessions,
      physio: physioSessions,
    }),
    [coachSessions, nutritionistSessions, physioSessions],
  );

  const activeSM = sessionManagers[activePersona];
  const activeSession = activeSM.activeSession;
  const currentPersona = personas.find((p) => p.id === activePersona) ?? personas[0];

  // Persistence
  const { loadMessages, persistMessage, getMemorySummary, maybeTriggerSummary } =
    useChatPersistence();

  // Single chat instance keyed by active session
  const activeChat = usePersistentChat(activeSession?.id ?? null);

  // Load persisted messages when session changes
  const loadedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const sid = activeSession?.id ?? null;
    if (!sid || sid === loadedSessionRef.current) return;
    loadedSessionRef.current = sid;

    const load = async () => {
      const messages = await loadMessages(sid);
      if (messages.length > 0) {
        activeChat.setMessages(messages);
      } else {
        activeChat.setMessages([]);
      }

      // Load memory summary
      const summary = await getMemorySummary(sid);
      setMemory(summary);
    };

    load();
  }, [activeSession?.id, loadMessages, getMemorySummary, activeChat]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChat.messages.length, activeChat.status]);

  // Persist messages when they change (after streaming completes)
  const lastPersistedCount = useRef(0);

  useEffect(() => {
    if (!activeSession?.id) return;
    if (activeChat.status === "streaming") return;

    const messages = activeChat.messages;
    if (messages.length <= lastPersistedCount.current) return;

    // Persist only the new messages
    const newMessages = messages.slice(lastPersistedCount.current);
    lastPersistedCount.current = messages.length;

    const sessionId = activeSession.id;

    (async () => {
      for (const msg of newMessages) {
        await persistMessage(sessionId, msg);
      }

      // Update session metadata
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg
        ? (firstUserMsg.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("")
            .slice(0, 50) || "New conversation")
        : "New conversation";

      await activeSM.updateSession(sessionId, {
        title,
        messageCount: messages.length,
      });

      // Check if summary should be triggered
      maybeTriggerSummary(sessionId, messages.length, async (summary) => {
        setMemory(summary);
        await activeSM.updateSession(sessionId, { summary });
      });
    })();
  }, [activeChat.messages, activeChat.status, activeSession?.id, persistMessage, activeSM, maybeTriggerSummary]);

  // Reset persisted count when session changes
  useEffect(() => {
    lastPersistedCount.current = 0;
  }, [activeSession?.id]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || activeChat.status === "streaming") return;

    // Auto-create a session if none exists
    let session = activeSession;
    if (!session) {
      session = await activeSM.createSession();
    }

    // For long sessions, trim messages to context window
    const messages = activeChat.messages;
    const trimmedMessages =
      messages.length > MAX_MESSAGES_IN_CONTEXT
        ? messages.slice(-MAX_MESSAGES_IN_CONTEXT)
        : messages;

    // If trimming happened, set the trimmed messages first
    if (messages.length > MAX_MESSAGES_IN_CONTEXT) {
      activeChat.setMessages(trimmedMessages);
    }

    activeChat.sendMessage(
      { text: input.trim() },
      {
        body: {
          persona: activePersona,
          athleteContext,
          model: selectedModel,
          coachPlan: activePersona !== "coach" ? coachPlan?.content ?? null : null,
          memory,
        },
      },
    );
    setInput("");
  }, [input, activeChat, activePersona, athleteContext, selectedModel, coachPlan, memory, activeSession, activeSM]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = useCallback(async () => {
    await activeSM.createSession();
    activeChat.setMessages([]);
    lastPersistedCount.current = 0;
    setMemory(null);
    setShowSessions(false);
  }, [activeSM, activeChat]);

  const handleSelectSession = useCallback(
    (id: string) => {
      activeSM.selectSession(id);
      lastPersistedCount.current = 0;
      loadedSessionRef.current = null; // Force reload
      setShowSessions(false);
    },
    [activeSM],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await activeSM.deleteSession(id);
      if (activeSM.sessions.length <= 1) {
        activeChat.setMessages([]);
        lastPersistedCount.current = 0;
        setMemory(null);
      }
    },
    [activeSM, activeChat],
  );

  const handlePersonaSwitch = useCallback((personaId: PersonaId) => {
    setActivePersona(personaId);
    loadedSessionRef.current = null; // Force reload on persona switch
    lastPersistedCount.current = 0;
    setShowSessions(false);
  }, []);

  const isStreaming = activeChat.status === "streaming";
  const hasError = activeChat.error;

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Persona selector */}
      <div className="p-3 border-b-3 border-border flex gap-2">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePersonaSwitch(p.id)}
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

      {/* Session header */}
      <div className="px-3 py-2 border-b-3 border-border flex items-center gap-2 bg-background">
        <button
          onClick={() => setShowSessions(!showSessions)}
          aria-label="Toggle session list"
          tabIndex={0}
          className="flex-1 flex items-center gap-1.5 text-xs font-bold truncate text-left hover:text-primary transition-colors"
        >
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {activeSM.isLoading
              ? "Loading..."
              : activeSession?.title ?? "No conversation"}
          </span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${showSessions ? "rotate-180" : ""}`}
          />
        </button>
        <button
          onClick={handleNewConversation}
          aria-label="New conversation"
          tabIndex={0}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-muted transition-colors"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>

      {/* Session list dropdown */}
      {showSessions && (
        <div className="border-b-3 border-border bg-muted/30 max-h-48 overflow-y-auto">
          {activeSM.sessions.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              No conversations yet
            </div>
          )}
          {activeSM.sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-border/50 last:border-b-0 cursor-pointer transition-colors ${
                session.id === activeSession?.id
                  ? "bg-primary/10 font-black"
                  : "hover:bg-muted font-medium"
              }`}
            >
              <button
                onClick={() => handleSelectSession(session.id)}
                aria-label={`Select conversation: ${session.title}`}
                tabIndex={0}
                className="flex-1 text-left truncate"
              >
                <span className="block truncate">{session.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleDateString()} &middot; {session.messageCount} msgs
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                aria-label={`Delete conversation: ${session.title}`}
                tabIndex={0}
                className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Context loading indicator */}
      {contextLoading && (
        <div className="px-3 py-2 bg-muted/50 border-b-3 border-border flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading your training data...
        </div>
      )}

      {/* Memory indicator */}
      {memory && (
        <div className="px-3 py-1.5 bg-secondary/10 border-b-3 border-border flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
          <MessageSquare className="h-3 w-3 shrink-0" />
          Memory active — past conversations remembered
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
                className={`flex-1 p-3 border-3 border-border text-sm font-medium overflow-hidden break-words ${
                  isUser ? "bg-muted ml-4 md:ml-10" : "bg-accent/20 mr-4 md:mr-10"
                } ${isSharedPlan ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-black text-xs uppercase mb-1 block">
                  {isUser ? "You" : currentPersona.label}
                </span>
                {isUser ? (
                  textContent
                ) : (
                  <div className="prose-sm overflow-hidden">
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
            <div className="p-3 border-3 border-border text-sm font-medium bg-accent/20 mr-4 md:mr-10">
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
          className="flex-1 min-w-0 px-3 py-2 border-3 border-border font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
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

import { useState, useRef, useEffect } from "react";
import { aiConversations, aiMockResponses, AIMessage } from "@/lib/mockData";

const personas = [
  { id: "coach", label: "Coach" },
  { id: "nutritionist", label: "Nutrition" },
  { id: "physio", label: "Physio" },
];

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
            className={`flex-1 px-2 py-2 rounded-full border-3 border-foreground font-bold text-xs transition-all ${
              activePersona === p.id
                ? "bg-primary text-primary-foreground shadow-neo-sm"
                : "bg-background hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 border-3 border-foreground text-sm font-medium ${
              msg.role === "user"
                ? "bg-muted ml-6"
                : "bg-accent/20 mr-6"
            }`}
          >
            <span className="font-black text-xs uppercase mb-1 block">
              {msg.role === "user"
                ? "You"
                : personas.find((p) => p.id === activePersona)?.label}
            </span>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t-3 border-foreground flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask your AI team..."
          className="flex-1 px-3 py-2 border-3 border-foreground font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-foreground text-background font-black text-sm border-3 border-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default AITeamChat;

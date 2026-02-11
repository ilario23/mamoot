// ============================================================
// useChatPersistence — Message persistence and memory summaries
// ============================================================
//
// Bridges the Vercel AI SDK's useChat with Neon storage.
// Handles loading messages for a session, persisting new messages,
// and triggering summary generation when conversations grow long.

import {useCallback, useRef} from 'react';
import type {CachedChatMessage} from '@/lib/cacheTypes';
import {neonGetChatMessages, neonSyncChatMessages, neonGetChatSession} from '@/lib/chatSync';
import type {UIMessage} from 'ai';

/** How many assistant messages before we auto-trigger a summary */
const SUMMARY_THRESHOLD = 10;

/** Max messages to send to the LLM when a session is very long */
export const MAX_MESSAGES_IN_CONTEXT = 20;

interface UseChatPersistenceResult {
  /** Load messages for a session (from Neon) and return as UIMessages */
  loadMessages: (sessionId: string) => Promise<UIMessage[]>;
  /** Persist a single message to Neon */
  persistMessage: (sessionId: string, msg: UIMessage) => Promise<void>;
  /** Get the memory summary for a session */
  getMemorySummary: (sessionId: string) => Promise<string | null>;
  /** Check if summary should be triggered, and trigger if needed */
  maybeTriggerSummary: (
    sessionId: string,
    messageCount: number,
    onSummaryGenerated: (summary: string) => void,
  ) => void;
}

/** Extract plain text from a stored content field (handles both JSON parts and legacy text). */
const extractTextFromContent = (content: string): string => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((p: {type: string}) => p.type === 'text')
        .map((p: {text: string}) => p.text)
        .join('');
    }
  } catch {
    // Not JSON — legacy plain text
  }
  return content;
};

/** Convert a CachedChatMessage to the UIMessage format used by useChat.
 *  New messages store the full parts array as JSON; legacy messages store plain text. */
const toUIMessage = (msg: CachedChatMessage): UIMessage => {
  // Try to parse as JSON parts array (new format)
  try {
    const parsed = JSON.parse(msg.content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: parsed,
      };
    }
  } catch {
    // Not JSON — fall through to legacy handling
  }

  // Legacy format: plain text content
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{type: 'text' as const, text: msg.content}],
  };
};

export const useChatPersistence = (): UseChatPersistenceResult => {
  // Track which sessions have an in-flight summary to avoid duplicates
  const summaryInFlight = useRef<Set<string>>(new Set());

  const loadMessages = useCallback(async (sessionId: string): Promise<UIMessage[]> => {
    const remote = await neonGetChatMessages(sessionId);
    if (!remote || remote.length === 0) return [];

    const sorted = [...remote].sort((a, b) => a.createdAt - b.createdAt);
    return sorted.map(toUIMessage);
  }, []);

  const persistMessage = useCallback(async (sessionId: string, msg: UIMessage) => {
    const parts = msg.parts ?? [];
    if (parts.length === 0) return;

    // Serialize the full parts array as JSON so tool calls, plan cards, etc. survive reload
    const content = JSON.stringify(parts);

    const record: CachedChatMessage = {
      id: msg.id,
      sessionId,
      role: msg.role,
      content,
      createdAt: Date.now(),
    };

    await neonSyncChatMessages(record);
  }, []);

  const getMemorySummary = useCallback(async (sessionId: string): Promise<string | null> => {
    const session = await neonGetChatSession(sessionId);
    return session?.summary ?? null;
  }, []);

  const maybeTriggerSummary = useCallback((
    sessionId: string,
    messageCount: number,
    onSummaryGenerated: (summary: string) => void,
  ) => {
    // Only trigger at threshold crossings (every SUMMARY_THRESHOLD assistant messages)
    // messageCount includes both user and assistant, so we check total messages
    if (messageCount < SUMMARY_THRESHOLD * 2) return;
    if (messageCount % (SUMMARY_THRESHOLD * 2) !== 0) return;
    if (summaryInFlight.current.has(sessionId)) return;

    summaryInFlight.current.add(sessionId);

    // Run summary generation in the background
    (async () => {
      try {
        // Load all messages for the session from Neon
        const remote = await neonGetChatMessages(sessionId);
        if (!remote || remote.length === 0) return;

        const messages = [...remote].sort((a, b) => a.createdAt - b.createdAt);

        // Get existing summary
        const session = await neonGetChatSession(sessionId);
        const existingSummary = session?.summary ?? null;

        const res = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            messages: messages.map((m) => ({role: m.role, content: extractTextFromContent(m.content)})),
            existingSummary,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.summary) {
            onSummaryGenerated(data.summary);
          }
        }
      } catch {
        // Summary generation is best-effort
      } finally {
        summaryInFlight.current.delete(sessionId);
      }
    })();
  }, []);

  return {loadMessages, persistMessage, getMemorySummary, maybeTriggerSummary};
};

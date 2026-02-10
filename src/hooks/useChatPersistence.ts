// ============================================================
// useChatPersistence — Message persistence and memory summaries
// ============================================================
//
// Bridges the Vercel AI SDK's useChat with Dexie/Neon storage.
// Handles loading messages for a session, persisting new messages,
// and triggering summary generation when conversations grow long.

import {useCallback, useRef} from 'react';
import {db} from '@/lib/db';
import type {CachedChatMessage} from '@/lib/db';
import {neonGetChatMessages, neonSyncChatMessages} from '@/lib/chatSync';
import type {UIMessage} from 'ai';

/** How many assistant messages before we auto-trigger a summary */
const SUMMARY_THRESHOLD = 10;

/** Max messages to send to the LLM when a session is very long */
export const MAX_MESSAGES_IN_CONTEXT = 20;

interface UseChatPersistenceResult {
  /** Load messages for a session (from Dexie, fallback to Neon) and return as UIMessages */
  loadMessages: (sessionId: string) => Promise<UIMessage[]>;
  /** Persist a single message to Dexie + Neon */
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

/** Convert a CachedChatMessage to the UIMessage format used by useChat */
const toUIMessage = (msg: CachedChatMessage): UIMessage => ({
  id: msg.id,
  role: msg.role as 'user' | 'assistant',
  parts: [{type: 'text' as const, text: msg.content}],
});

export const useChatPersistence = (): UseChatPersistenceResult => {
  // Track which sessions have an in-flight summary to avoid duplicates
  const summaryInFlight = useRef<Set<string>>(new Set());

  const loadMessages = useCallback(async (sessionId: string): Promise<UIMessage[]> => {
    // Try Dexie first
    let local = await db.chatMessages
      .where('sessionId')
      .equals(sessionId)
      .sortBy('createdAt');

    // Backfill from Neon if Dexie is empty
    if (local.length === 0) {
      const remote = await neonGetChatMessages(sessionId);
      if (remote && remote.length > 0) {
        await db.chatMessages.bulkPut(remote);
        local = remote.sort((a, b) => a.createdAt - b.createdAt);
      }
    }

    return local.map(toUIMessage);
  }, []);

  const persistMessage = useCallback(async (sessionId: string, msg: UIMessage) => {
    // Extract text content from message parts
    const content = msg.parts
      ?.filter((part): part is {type: 'text'; text: string} => part.type === 'text')
      .map((part) => part.text)
      .join('') ?? '';

    if (!content) return;

    const record: CachedChatMessage = {
      id: msg.id,
      sessionId,
      role: msg.role,
      content,
      createdAt: Date.now(),
    };

    await db.chatMessages.put(record);
    neonSyncChatMessages(record);
  }, []);

  const getMemorySummary = useCallback(async (sessionId: string): Promise<string | null> => {
    const session = await db.chatSessions.get(sessionId);
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
        // Load all messages for the session
        const messages = await db.chatMessages
          .where('sessionId')
          .equals(sessionId)
          .sortBy('createdAt');

        // Get existing summary
        const session = await db.chatSessions.get(sessionId);
        const existingSummary = session?.summary ?? null;

        const res = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            messages: messages.map((m) => ({role: m.role, content: m.content})),
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

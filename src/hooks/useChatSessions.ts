// ============================================================
// useChatSessions — Manages chat sessions per persona
// ============================================================
//
// Handles CRUD for chat sessions backed by Neon (PostgreSQL).
// Sessions are scoped to (athleteId, persona).

import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedChatSession} from '@/lib/cacheTypes';
import {neonGetChatSessions, neonSyncChatSessions, neonDeleteChatSession} from '@/lib/chatSync';
import type {PersonaId} from '@/lib/aiPrompts';

const generateId = (): string => crypto.randomUUID();

interface UseChatSessionsResult {
  /** Sessions sorted by updatedAt desc */
  sessions: CachedChatSession[];
  /** Currently active session (null before first load) */
  activeSession: CachedChatSession | null;
  /** Whether sessions are still loading */
  isLoading: boolean;
  /** Create a new session and set it active */
  createSession: () => Promise<CachedChatSession>;
  /** Switch to an existing session */
  selectSession: (id: string) => void;
  /** Delete a session and its messages */
  deleteSession: (id: string) => Promise<void>;
  /** Update session metadata (title, summary, messageCount) */
  updateSession: (id: string, updates: Partial<Pick<CachedChatSession, 'title' | 'summary' | 'messageCount'>>) => Promise<void>;
}

export const useChatSessions = (
  athleteId: number | null,
  persona: PersonaId,
): UseChatSessionsResult => {
  const [sessions, setSessions] = useState<CachedChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadedRef = useRef<string | null>(null);

  // Load sessions from Neon
  useEffect(() => {
    if (!athleteId) {
      setIsLoading(false);
      return;
    }

    const key = `${athleteId}-${persona}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;

    const load = async () => {
      setIsLoading(true);

      const remote = await neonGetChatSessions(athleteId, persona);
      const loaded = remote
        ? [...remote].sort((a, b) => b.updatedAt - a.updatedAt)
        : [];

      setSessions(loaded);

      // Auto-select the most recent session
      if (loaded.length > 0) {
        setActiveSessionId(loaded[0].id);
      } else {
        setActiveSessionId(null);
      }

      setIsLoading(false);
    };

    load();
  }, [athleteId, persona]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const createSession = useCallback(async (): Promise<CachedChatSession> => {
    const now = Date.now();
    const session: CachedChatSession = {
      id: generateId(),
      athleteId: athleteId ?? 0,
      persona,
      title: 'New conversation',
      summary: null,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await neonSyncChatSessions(session);

    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);

    return session;
  }, [athleteId, persona]);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    // Delete from Neon (cascade deletes messages + linked plans)
    await neonDeleteChatSession(id);

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      // If the deleted session was active, switch to the most recent
      if (id === activeSessionId && next.length > 0) {
        setActiveSessionId(next[0].id);
      } else if (next.length === 0) {
        setActiveSessionId(null);
      }
      return next;
    });
  }, [activeSessionId]);

  const updateSession = useCallback(async (
    id: string,
    updates: Partial<Pick<CachedChatSession, 'title' | 'summary' | 'messageCount'>>,
  ) => {
    setSessions((prev) => {
      const session = prev.find((s) => s.id === id);
      if (!session) return prev;

      const updated: CachedChatSession = {
        ...session,
        ...updates,
        updatedAt: Date.now(),
      };

      // Write to Neon (fire-and-forget for session metadata updates)
      neonSyncChatSessions(updated);

      return prev
        .map((s) => (s.id === id ? updated : s))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  return {
    sessions,
    activeSession,
    isLoading,
    createSession,
    selectSession,
    deleteSession,
    updateSession,
  };
};

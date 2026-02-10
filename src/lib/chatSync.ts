// ============================================================
// Chat Sync — Client-side helpers for chat persistence in Neon
// ============================================================
//
// Provides typed read/write functions that call /api/db/[table]
// for chat sessions and messages. Follows the same pattern as
// neonSync.ts: reads are awaitable, writes are fire-and-forget.

import type {CachedChatSession, CachedChatMessage, CachedCoachPlan} from './db';

const API = '/api/db';

// ---- Internal helpers ----

/** Fire-and-forget POST to Neon. Never throws, never blocks. */
const postToNeon = (table: string, data: unknown): void => {
  fetch(`${API}/${table}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  }).catch(() => {
    // Silently ignore — Neon sync is best-effort
  });
};

/** Awaitable GET from Neon. Returns parsed JSON or null on any error. */
const getFromNeon = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

// ---- Chat Sessions ----

export const neonGetChatSessions = async (
  athleteId: number,
  persona: string,
): Promise<CachedChatSession[] | null> =>
  getFromNeon<CachedChatSession[]>(
    `${API}/chat-sessions?athleteId=${athleteId}&persona=${persona}`,
  );

export const neonSyncChatSessions = (
  records: CachedChatSession | CachedChatSession[],
): void => {
  postToNeon('chat-sessions', records);
};

// ---- Chat Messages ----

export const neonGetChatMessages = async (
  sessionId: string,
): Promise<CachedChatMessage[] | null> =>
  getFromNeon<CachedChatMessage[]>(
    `${API}/chat-messages?sessionId=${sessionId}`,
  );

export const neonSyncChatMessages = (
  records: CachedChatMessage | CachedChatMessage[],
): void => {
  postToNeon('chat-messages', records);
};

// ---- Coach Plans ----

export const neonGetCoachPlan = async (
  athleteId: number,
): Promise<CachedCoachPlan | null> =>
  getFromNeon<CachedCoachPlan>(
    `${API}/coach-plans?athleteId=${athleteId}`,
  );

export const neonSyncCoachPlan = (record: CachedCoachPlan): void => {
  postToNeon('coach-plans', record);
};

/** Fire-and-forget DELETE to Neon. Never throws, never blocks. */
export const neonDeleteCoachPlan = (athleteId: number): void => {
  fetch(`${API}/coach-plans?athleteId=${athleteId}`, {
    method: 'DELETE',
  }).catch(() => {
    // Silently ignore — Neon sync is best-effort
  });
};

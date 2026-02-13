// ============================================================
// Chat Sync — Client-side helpers for chat persistence in Neon
// ============================================================
//
// Provides typed read/write functions that call /api/db/[table]
// for chat sessions, messages, and coach plans.
// Neon is the primary persistent store — writes are awaitable.

import type {CachedChatSession, CachedChatMessage, CachedCoachPlan, CachedPhysioPlan} from './cacheTypes';

const API = '/api/db';

// ---- Internal helpers ----

/** Awaitable POST to Neon. Resolves silently on success, logs on failure. */
const postToNeon = async (table: string, data: unknown): Promise<void> => {
  try {
    const res = await fetch(`${API}/${table}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn(`[chatSync] POST /${table} failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[chatSync] POST /${table} error:`, err);
  }
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

/** Get a single chat session by ID. */
export const neonGetChatSession = async (
  sessionId: string,
): Promise<CachedChatSession | null> =>
  getFromNeon<CachedChatSession>(
    `${API}/chat-sessions?id=${sessionId}`,
  );

export const neonSyncChatSessions = async (
  records: CachedChatSession | CachedChatSession[],
): Promise<void> => {
  await postToNeon('chat-sessions', records);
};

// ---- Chat Messages ----

export const neonGetChatMessages = async (
  sessionId: string,
): Promise<CachedChatMessage[] | null> =>
  getFromNeon<CachedChatMessage[]>(
    `${API}/chat-messages?sessionId=${sessionId}`,
  );

export const neonSyncChatMessages = async (
  records: CachedChatMessage | CachedChatMessage[],
): Promise<void> => {
  await postToNeon('chat-messages', records);
};

/** Awaitable delete of a chat session and all its data (messages, plans, memory). */
export const neonDeleteChatSession = async (sessionId: string): Promise<void> => {
  try {
    await fetch(`${API}/chat-sessions?id=${sessionId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[chatSync] DELETE chat-session error:', err);
  }
};

// ---- Coach Plans ----

/** Get all plans for an athlete (ordered by sharedAt desc). */
export const neonGetCoachPlans = async (
  athleteId: number,
): Promise<CachedCoachPlan[] | null> =>
  getFromNeon<CachedCoachPlan[]>(
    `${API}/coach-plans?athleteId=${athleteId}`,
  );

/** Get only the active plan for an athlete. */
export const neonGetActiveCoachPlan = async (
  athleteId: number,
): Promise<CachedCoachPlan | null> =>
  getFromNeon<CachedCoachPlan>(
    `${API}/coach-plans?athleteId=${athleteId}&active=true`,
  );

/** Awaitable upsert of a coach plan. */
export const neonSyncCoachPlan = async (record: CachedCoachPlan): Promise<void> => {
  await postToNeon('coach-plans', record);
};

/** Awaitable delete of a coach plan by ID. */
export const neonDeleteCoachPlan = async (planId: string): Promise<void> => {
  try {
    await fetch(`${API}/coach-plans?id=${planId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[chatSync] DELETE coach-plan error:', err);
  }
};

/** Awaitable activate a plan (deactivates all others for the athlete). */
export const neonActivateCoachPlan = async (
  planId: string,
  athleteId: number,
): Promise<void> => {
  try {
    await fetch(`${API}/coach-plans?id=${planId}&athleteId=${athleteId}`, {
      method: 'PATCH',
    });
  } catch (err) {
    console.warn('[chatSync] PATCH coach-plan activate error:', err);
  }
};

// ---- Physio Plans ----

/** Get all physio plans for an athlete (ordered by sharedAt desc). */
export const neonGetPhysioPlans = async (
  athleteId: number,
): Promise<CachedPhysioPlan[] | null> =>
  getFromNeon<CachedPhysioPlan[]>(
    `${API}/physio-plans?athleteId=${athleteId}`,
  );

/** Get only the active physio plan for an athlete. */
export const neonGetActivePhysioPlan = async (
  athleteId: number,
): Promise<CachedPhysioPlan | null> =>
  getFromNeon<CachedPhysioPlan>(
    `${API}/physio-plans?athleteId=${athleteId}&active=true`,
  );

/** Awaitable upsert of a physio plan. */
export const neonSyncPhysioPlan = async (record: CachedPhysioPlan): Promise<void> => {
  await postToNeon('physio-plans', record);
};

/** Awaitable delete of a physio plan by ID. */
export const neonDeletePhysioPlan = async (planId: string): Promise<void> => {
  try {
    await fetch(`${API}/physio-plans?id=${planId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[chatSync] DELETE physio-plan error:', err);
  }
};

/** Awaitable activate a physio plan (deactivates all others for the athlete). */
export const neonActivatePhysioPlan = async (
  planId: string,
  athleteId: number,
): Promise<void> => {
  try {
    await fetch(`${API}/physio-plans?id=${planId}&athleteId=${athleteId}`, {
      method: 'PATCH',
    });
  } catch (err) {
    console.warn('[chatSync] PATCH physio-plan activate error:', err);
  }
};

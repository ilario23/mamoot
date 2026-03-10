// ============================================================
// Chat Sync — Client-side helpers for chat persistence in Neon
// ============================================================
//
// Provides typed read/write functions that call /api/db/[table]
// for chat sessions, messages, and weekly plans.
// Neon is the primary persistent store — writes are awaitable.

import type {
  CachedChatSession,
  CachedChatMessage,
  CachedWeeklyPlan,
  CachedTrainingBlock,
  CachedOrchestratorGoal,
  CachedOrchestratorPlanItem,
  CachedOrchestratorBlocker,
  CachedOrchestratorHandoff,
  WeekOutline,
  TrainingPhase,
} from './cacheTypes';
import {dbFetch} from './dbClient';

const API = '/api/db';

// ---- Internal helpers ----

/** Awaitable POST to Neon. Resolves silently on success, logs on failure. */
const postToNeon = async (table: string, data: unknown): Promise<void> => {
  try {
    const res = await dbFetch(`${API}/${table}`, {
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
    const res = await dbFetch(url);
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
export const neonDeleteChatSession = async (
  sessionId: string,
  athleteId?: number,
): Promise<void> => {
  try {
    await dbFetch(`${API}/chat-sessions?id=${sessionId}`, {
      method: 'DELETE',
    }, athleteId ?? null);
  } catch (err) {
    console.warn('[chatSync] DELETE chat-session error:', err);
  }
};

// ---- Weekly Plans ----

/** Get all weekly plans for an athlete (ordered by createdAt desc). */
export const neonGetWeeklyPlans = async (
  athleteId: number,
): Promise<CachedWeeklyPlan[] | null> =>
  getFromNeon<CachedWeeklyPlan[]>(
    `${API}/weekly-plans?athleteId=${athleteId}`,
  );

/** Get only the active weekly plan for an athlete. */
export const neonGetActiveWeeklyPlan = async (
  athleteId: number,
): Promise<CachedWeeklyPlan | null> =>
  getFromNeon<CachedWeeklyPlan>(
    `${API}/weekly-plans?athleteId=${athleteId}&active=true`,
  );

/** Awaitable upsert of a weekly plan. */
export const neonSyncWeeklyPlan = async (record: CachedWeeklyPlan): Promise<void> => {
  await postToNeon('weekly-plans', record);
};

/** Awaitable delete of a weekly plan by ID. */
export const neonDeleteWeeklyPlan = async (
  planId: string,
  athleteId?: number,
): Promise<void> => {
  try {
    await dbFetch(`${API}/weekly-plans?id=${planId}&athleteId=${athleteId ?? ''}`, {
      method: 'DELETE',
    }, athleteId ?? null);
  } catch (err) {
    console.warn('[chatSync] DELETE weekly-plan error:', err);
  }
};

/** Awaitable activate a weekly plan (deactivates all others for the athlete). */
export const neonActivateWeeklyPlan = async (
  planId: string,
  athleteId: number,
): Promise<boolean> => {
  try {
    const res = await dbFetch(`${API}/weekly-plans?id=${planId}&athleteId=${athleteId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    }, athleteId);
    return res.ok;
  } catch (err) {
    console.warn('[chatSync] PATCH weekly-plan activate error:', err);
    return false;
  }
};

export const neonUpdateWeeklyPlanSessions = async (
  planId: string,
  athleteId: number,
  sessions: CachedWeeklyPlan['sessions'],
  content?: string,
): Promise<boolean> => {
  try {
    const res = await dbFetch(`${API}/weekly-plans?id=${planId}&athleteId=${athleteId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessions,
        ...(typeof content === 'string' ? {content} : {}),
      }),
    }, athleteId);
    return res.ok;
  } catch (err) {
    console.warn('[chatSync] PATCH weekly-plan sessions error:', err);
    return false;
  }
};

// ---- Training Blocks ----

export const neonGetTrainingBlocks = async (
  athleteId: number,
): Promise<CachedTrainingBlock[] | null> =>
  getFromNeon<CachedTrainingBlock[]>(
    `${API}/training-blocks?athleteId=${athleteId}`,
  );

export const neonGetActiveTrainingBlock = async (
  athleteId: number,
): Promise<CachedTrainingBlock | null> =>
  getFromNeon<CachedTrainingBlock>(
    `${API}/training-blocks?athleteId=${athleteId}&active=true`,
  );

export const neonSyncTrainingBlock = async (record: CachedTrainingBlock): Promise<void> => {
  await postToNeon('training-blocks', record);
};

export const neonDeleteTrainingBlock = async (
  blockId: string,
  athleteId: number,
): Promise<void> => {
  try {
    await dbFetch(`${API}/training-blocks?id=${blockId}&athleteId=${athleteId}`, {
      method: 'DELETE',
    }, athleteId);
  } catch (err) {
    console.warn('[chatSync] DELETE training-block error:', err);
  }
};

export const neonActivateTrainingBlock = async (
  blockId: string,
  athleteId: number,
): Promise<boolean> => {
  try {
    const res = await dbFetch(`${API}/training-blocks?id=${blockId}&athleteId=${athleteId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    }, athleteId);
    return res.ok;
  } catch (err) {
    console.warn('[chatSync] PATCH training-block activate error:', err);
    return false;
  }
};

export const neonUpdateTrainingBlockOutlines = async (
  blockId: string,
  weekOutlines: WeekOutline[],
  phases?: TrainingPhase[],
): Promise<void> => {
  try {
    await dbFetch(`${API}/training-blocks?id=${blockId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        weekOutlines,
        ...(phases ? {phases} : {}),
        updatedAt: Date.now(),
      }),
    });
  } catch (err) {
    console.warn('[chatSync] PATCH training-block outlines error:', err);
  }
};

// ---- Legacy orchestrator state (removed) ----
// These helpers are intentionally no-op/empty for backward compatibility.
export const neonGetOrchestratorGoals = async (
  _athleteId?: number,
  _sessionId?: string,
): Promise<CachedOrchestratorGoal[] | null> => null;
export const neonSyncOrchestratorGoals = async (
  _records: CachedOrchestratorGoal | CachedOrchestratorGoal[],
): Promise<void> => {};
export const neonGetOrchestratorPlanItems = async (
  _athleteId?: number,
  _sessionId?: string,
): Promise<CachedOrchestratorPlanItem[] | null> => null;
export const neonSyncOrchestratorPlanItems = async (
  _records: CachedOrchestratorPlanItem | CachedOrchestratorPlanItem[],
): Promise<void> => {};
export const neonGetOrchestratorBlockers = async (
  _athleteId?: number,
  _sessionId?: string,
): Promise<CachedOrchestratorBlocker[] | null> => null;
export const neonSyncOrchestratorBlockers = async (
  _records: CachedOrchestratorBlocker | CachedOrchestratorBlocker[],
): Promise<void> => {};
export const neonGetOrchestratorHandoffs = async (
  _athleteId?: number,
  _sessionId?: string,
): Promise<CachedOrchestratorHandoff[] | null> => null;
export const neonSyncOrchestratorHandoffs = async (
  _records: CachedOrchestratorHandoff | CachedOrchestratorHandoff[],
): Promise<void> => {};


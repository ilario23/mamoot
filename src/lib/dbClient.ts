const ATHLETE_STORAGE_KEY = 'mamoot-strava-athlete';

const getAthleteIdFromStorage = (): number | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ATHLETE_STORAGE_KEY);
    if (!raw) return null;
    const athlete = JSON.parse(raw) as {id?: number};
    const id = athlete?.id;
    return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const getAthleteIdFromUrl = (input: string): number | null => {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(input, base);
    const raw = url.searchParams.get('athleteId');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

export const dbFetch = (
  input: string,
  init: RequestInit = {},
  athleteId?: number | null,
): Promise<Response> => {
  const resolvedAthleteId =
    athleteId ?? getAthleteIdFromUrl(input) ?? getAthleteIdFromStorage();
  const headers = new Headers(init.headers);
  if (resolvedAthleteId && !headers.has('x-athlete-id')) {
    headers.set('x-athlete-id', String(resolvedAthleteId));
  }
  return fetch(input, {
    ...init,
    headers,
  });
};

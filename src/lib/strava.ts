// ============================================================
// Strava API Client
// ============================================================

import type { ActivitySummary, ActivityType, StreamPoint } from "./activityModel";

// ----- Constants -----

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? "";
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI ??
  (typeof window !== "undefined" ? `${window.location.origin}/settings` : "http://localhost:3000/settings");

const SCOPES = "read,activity:read_all,profile:read_all";

// ----- Token storage -----

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix timestamp
  athlete: StravaAthlete;
}

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  country: string;
  sex: string;
  profile_medium: string;
  profile: string;
}

const ATHLETE_STORAGE_KEY = "mamoot-strava-athlete";
const CSRF_STORAGE_KEY = "mamoot-strava-csrf-token";

const getStoredCsrfToken = (): string | null => {
  try {
    return localStorage.getItem(CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
};

const setStoredCsrfToken = (value: string): void => {
  localStorage.setItem(CSRF_STORAGE_KEY, value);
};

const ensureCsrfToken = async (): Promise<string> => {
  const stored = getStoredCsrfToken();
  if (stored) return stored;
  const res = await fetch("/api/strava/session");
  const csrfHeader = res.headers.get("x-csrf-token");
  if (!csrfHeader) throw new Error("Missing CSRF token from broker");
  setStoredCsrfToken(csrfHeader);
  return csrfHeader;
};

export const getStoredTokens = (athleteId?: number): StravaTokens | null => {
  try {
    void athleteId;
    const raw = localStorage.getItem(ATHLETE_STORAGE_KEY);
    if (!raw) return null;
    const athlete = JSON.parse(raw) as StravaAthlete;
    return {
      access_token: "broker",
      refresh_token: "broker",
      expires_at: 0,
      athlete,
    };
  } catch {
    return null;
  }
};

export const storeTokens = (tokens: StravaTokens): void => {
  localStorage.setItem(ATHLETE_STORAGE_KEY, JSON.stringify(tokens.athlete));
};

export const clearTokens = (athleteId?: number): void => {
  void athleteId;
  localStorage.removeItem(ATHLETE_STORAGE_KEY);
  localStorage.removeItem(CSRF_STORAGE_KEY);
  void fetch("/api/strava/session?action=logout", {
    method: "POST",
    headers: {
      "x-csrf-token": getStoredCsrfToken() ?? "",
    },
  }).catch(() => {});
};

// ----- OAuth helpers -----

export const getAuthUrl = (): string => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPES,
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
};

export const exchangeCodeForTokens = async (
  code: string
): Promise<StravaTokens> => {
  // Use the Next.js API route to keep client_secret server-side
  const res = await fetch("/api/strava/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, grant_type: "authorization_code" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  const tokens: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  };

  storeTokens(tokens);
  return tokens;
};

export const refreshAccessToken = async (
  refreshToken: string
): Promise<StravaTokens> => {
  const csrfToken = await ensureCsrfToken();
  const res = await fetch("/api/strava/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Token refresh failed");
  }

  const data = await res.json();
  const stored = getStoredTokens();
  const tokens: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: stored?.athlete ?? data.athlete,
  };

  storeTokens(tokens);
  return tokens;
};

// ----- Authenticated fetch -----

const getValidAccessToken = async (): Promise<string> => {
  const csrfToken = await ensureCsrfToken();
  const response = await fetch("/api/strava/session/access-token", {
    method: "POST",
    headers: {"x-csrf-token": csrfToken},
  });
  if (!response.ok) {
    throw new Error("Not authenticated with Strava");
  }
  const data = (await response.json()) as {accessToken?: string};
  if (!data.accessToken) {
    throw new Error("Missing access token from broker");
  }
  return data.accessToken;
};

const stravaFetch = async <T>(
  endpoint: string,
  params?: Record<string, string>
): Promise<T> => {
  const token = await getValidAccessToken();
  const url = new URL(`${STRAVA_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Strava API error (${res.status}): ${errorBody}`);
  }

  return res.json();
};

// ----- API functions -----

/** Strava SummaryActivity as returned by the API */
export interface StravaSummaryActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  timezone: string;
  average_speed: number; // m/s
  max_speed: number; // m/s
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  map?: {
    id: string;
    summary_polyline: string | null;
    resource_state: number;
  };
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  workout_type?: number;
  gear_id?: string;
}

/** A best effort for a standard distance within an activity */
export interface StravaBestEffort {
  id: number;
  resource_state: number;
  name: string; // e.g. "400m", "1k", "1 Mile", "5k", "10k", "Half-Marathon"
  activity: { id: number; resource_state: number };
  athlete: { id: number; resource_state: number };
  elapsed_time: number; // seconds
  moving_time: number; // seconds
  start_date: string;
  start_date_local: string;
  distance: number; // meters
  start_index: number;
  end_index: number;
  pr_rank: number | null; // 1 = PR, 2 = 2nd, 3 = 3rd, null = not top 3
  achievements: unknown[];
}

/** A segment effort recorded when an athlete passes through a segment */
export interface StravaSegmentEffort {
  id: number;
  name: string;
  elapsed_time: number; // seconds
  moving_time: number; // seconds
  start_date_local: string;
  distance: number; // meters
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  pr_rank: number | null; // 1 = PR, 2 = 2nd, 3 = 3rd
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
    city: string;
    state: string;
    climb_category: number;
    starred: boolean;
  };
  achievements: { type_id: number; type: string; rank: number }[];
}

/** A starred (favourite) segment from the authenticated athlete */
export interface StravaStarredSegment {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  city: string;
  state: string;
  climb_category: number;
  athlete_pr_effort?: { elapsed_time: number; distance: number };
  starred_date: string;
}

/** Strava DetailedActivity */
export interface StravaDetailedActivity extends StravaSummaryActivity {
  description: string;
  device_name: string;
  calories: number;
  segment_efforts: StravaSegmentEffort[];
  splits_metric: StravaSplit[];
  laps: StravaLap[];
  best_efforts: StravaBestEffort[];
  gear?: {
    id: string;
    primary: boolean;
    name: string;
    distance: number;
  };
}

export interface StravaSplit {
  distance: number; // meters
  elapsed_time: number; // seconds
  elevation_difference: number; // meters
  moving_time: number; // seconds
  average_speed: number; // m/s
  pace_zone: number;
  split: number;
  average_heartrate?: number;
}

export interface StravaLap {
  id: number;
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
}

export interface StravaStream {
  type: string;
  data: number[] | number[][] | boolean[];
  series_type: string;
  original_size: number;
  resolution: string;
}

/** Response shape when key_by_type=true (object keyed by stream type) */
export type StravaStreamSet = Record<
  string,
  Omit<StravaStream, "type">
>;

// ----- Gear types -----

/** Summary gear as returned within DetailedAthlete (bikes/shoes arrays) */
export interface StravaSummaryGear {
  id: string;
  primary: boolean;
  name: string;
  distance: number; // meters
  resource_state: number;
}

/** Detailed gear as returned by GET /gear/:id */
export interface StravaDetailedGear extends StravaSummaryGear {
  brand_name: string;
  model_name: string;
  frame_type?: number; // bikes only: 1=mtb, 2=cross, 3=road, 4=time trial
  description: string;
}

/** Extended athlete profile including gear arrays returned by GET /athlete */
export interface StravaAthleteWithGear extends StravaAthlete {
  weight: number;
  ftp: number | null;
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
}

export interface StravaAthleteZones {
  heart_rate: {
    custom_zones: boolean;
    zones: { min: number; max: number }[];
  };
  power?: {
    zones: { min: number; max: number }[];
  };
}

export interface StravaAthleteStats {
  recent_run_totals: StravaActivityTotal;
  recent_ride_totals: StravaActivityTotal;
  recent_swim_totals: StravaActivityTotal;
  ytd_run_totals: StravaActivityTotal;
  ytd_ride_totals: StravaActivityTotal;
  ytd_swim_totals: StravaActivityTotal;
  all_run_totals: StravaActivityTotal;
  all_ride_totals: StravaActivityTotal;
  all_swim_totals: StravaActivityTotal;
  biggest_ride_distance: number;
  biggest_climb_elevation_gain: number;
}

export interface StravaActivityTotal {
  count: number;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  elevation_gain: number; // meters
  achievement_count: number;
}

// ----- Public API methods -----

export const fetchAthleteProfile = () =>
  stravaFetch<StravaAthlete & { weight: number; ftp: number | null }>(
    "/athlete"
  );

export const fetchAthleteZones = () =>
  stravaFetch<StravaAthleteZones>("/athlete/zones");

export const fetchAthleteStats = (athleteId: number) =>
  stravaFetch<StravaAthleteStats>(`/athletes/${athleteId}/stats`);

export const fetchActivities = (
  page = 1,
  perPage = 50,
  after?: number,
  before?: number
) => {
  const params: Record<string, string> = {
    page: String(page),
    per_page: String(perPage),
  };
  if (after) params.after = String(after);
  if (before) params.before = String(before);
  return stravaFetch<StravaSummaryActivity[]>("/athlete/activities", params);
};

export const fetchAllActivities = async (
  maxPages = 10
): Promise<StravaSummaryActivity[]> => {
  const firstPage = await fetchActivities(1, 100);

  if (firstPage.length < 100 || maxPages <= 1) {
    return firstPage;
  }

  const all: StravaSummaryActivity[] = [...firstPage];
  const CONCURRENCY = 3;
  const pages = Array.from({length: maxPages - 1}, (_, i) => i + 2);

  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const chunk = pages.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (page) => {
        const batch = await fetchActivities(page, 100);
        return {page, batch};
      }),
    );

    chunkResults.sort((a, b) => a.page - b.page);
    for (const {batch} of chunkResults) {
      all.push(...batch);
    }

    // Once a page is not full, there are no more activities.
    if (chunkResults.some((result) => result.batch.length < 100)) {
      break;
    }
  }
  return all;
};

export const fetchActivityDetail = (activityId: number) =>
  stravaFetch<StravaDetailedActivity>(`/activities/${activityId}`);

export const fetchActivityStreams = async (
  activityId: number,
  keys = "time,distance,heartrate,altitude,velocity_smooth,cadence,latlng"
): Promise<StravaStream[]> => {
  // key_by_type=true returns an object keyed by stream type, not an array
  const raw = await stravaFetch<StravaStreamSet | StravaStream[]>(
    `/activities/${activityId}/streams`,
    { keys, key_by_type: "true" }
  );

  return normalizeStreams(raw);
};

export const fetchActivityZones = (activityId: number) =>
  stravaFetch<unknown[]>(`/activities/${activityId}/zones`);

export const fetchStarredSegments = () =>
  stravaFetch<StravaStarredSegment[]>("/segments/starred");

/** Detailed segment info returned by GET /segments/{id} */
export interface StravaSegmentDetail {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  city: string;
  state: string;
  climb_category: number;
  starred: boolean;
  athlete_count: number;
  effort_count: number;
  total_elevation_gain: number;
  map: {
    polyline: string;
  };
  start_latlng: [number, number];
  end_latlng: [number, number];
}

export const fetchSegmentDetail = (segmentId: number) =>
  stravaFetch<StravaSegmentDetail>(`/segments/${segmentId}`);

/** Fetch the authenticated athlete profile including bikes and shoes arrays */
export const fetchAthleteWithGear = () =>
  stravaFetch<StravaAthleteWithGear>("/athlete");

/** Fetch detailed gear info by ID (brand, model, description, etc.) */
export const fetchGearDetail = (gearId: string) =>
  stravaFetch<StravaDetailedGear>(`/gear/${gearId}`);

// ----- Data transformation -----

export const mapSportType = (sportType: string): ActivityType => {
  switch (sportType) {
    case "Run":
    case "TrailRun":
    case "VirtualRun":
      return "Run";
    case "Ride":
    case "MountainBikeRide":
    case "GravelRide":
    case "EBikeRide":
    case "EMountainBikeRide":
    case "VirtualRide":
      return "Ride";
    case "Hike":
      return "Hike";
    case "Swim":
      return "Swim";
    default:
      return "Run";
  }
};

export const transformActivity = (
  a: StravaSummaryActivity
): ActivitySummary => {
  const distanceKm = a.distance / 1000;
  const avgPace =
    distanceKm > 0 && a.moving_time > 0
      ? a.moving_time / 60 / distanceKm
      : 0;

  return {
    id: String(a.id),
    name: a.name,
    date: a.start_date_local.split("T")[0],
    type: mapSportType(a.sport_type),
    distance: Number(distanceKm.toFixed(2)),
    duration: a.moving_time,
    avgPace: Number(avgPace.toFixed(2)),
    avgHr: a.average_heartrate ?? 0,
    maxHr: a.max_heartrate ?? 0,
    elevationGain: Math.round(a.total_elevation_gain),
    calories: Math.round(a.calories ?? 0),
    hasDetailedData: true,
    polyline: a.map?.summary_polyline ?? undefined,
  };
};

/**
 * Normalize streams from either format:
 * - Array format: [{ type: "time", data: [...] }, ...]
 * - Keyed object format (key_by_type=true): { time: { data: [...] }, ... }
 */
export const normalizeStreams = (
  raw: StravaStream[] | StravaStreamSet
): StravaStream[] => {
  if (Array.isArray(raw)) return raw;

  return Object.entries(raw).map(([type, stream]) => ({
    type,
    ...stream,
  }));
};

export const transformStreams = (
  streams: StravaStream[] | StravaStreamSet
): StreamPoint[] => {
  // Normalise in case cached data is in keyed-object format
  const arr = normalizeStreams(streams);

  const timeStream = arr.find((s) => s.type === "time");
  const distStream = arr.find((s) => s.type === "distance");
  const hrStream = arr.find((s) => s.type === "heartrate");
  const altStream = arr.find((s) => s.type === "altitude");
  const velStream = arr.find((s) => s.type === "velocity_smooth");

  if (!timeStream) return [];

  const length = (timeStream.data as number[]).length;
  const points: StreamPoint[] = [];

  for (let i = 0; i < length; i++) {
    points.push({
      time: (timeStream.data as number[])[i],
      distance: distStream ? (distStream.data as number[])[i] : 0,
      velocity: velStream ? (velStream.data as number[])[i] : 0,
      heartrate: hrStream ? (hrStream.data as number[])[i] : 0,
      altitude: altStream ? (altStream.data as number[])[i] : 0,
    });
  }

  return points;
};

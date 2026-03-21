// ============================================================
// Strava OAuth token broker (server-only)
// ============================================================
// Shared cookie application + refresh-token exchange used by
// /api/strava/token and /api/strava/session/access-token.

import type {NextRequest} from 'next/server';
import type {NextResponse} from 'next/server';

export const STRAVA_ACCESS_COOKIE = 'strava_access_token';
export const STRAVA_REFRESH_COOKIE = 'strava_refresh_token';
export const STRAVA_EXPIRES_COOKIE = 'strava_expires_at';
export const STRAVA_ATHLETE_COOKIE = 'strava_athlete';
export const STRAVA_CSRF_COOKIE = 'strava_csrf_token';

const COOKIE_SECURE = process.env.NODE_ENV === 'production';

export type StravaTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: unknown;
};

export const validateRefreshCsrf = (request: NextRequest): boolean => {
  const csrfCookie = request.cookies.get(STRAVA_CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get('x-csrf-token');
  return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
};

/**
 * Apply Strava oauth/token JSON fields to httpOnly / public cookies on a response.
 */
export const applyStravaTokenPayloadToResponse = (
  response: NextResponse,
  parsed: StravaTokenPayload,
): void => {
  if (parsed.access_token) {
    response.cookies.set(STRAVA_ACCESS_COOKIE, parsed.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 6,
    });
  }
  if (parsed.refresh_token) {
    response.cookies.set(STRAVA_REFRESH_COOKIE, parsed.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (parsed.expires_at) {
    response.cookies.set(STRAVA_EXPIRES_COOKIE, String(parsed.expires_at), {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (parsed.athlete) {
    response.cookies.set(STRAVA_ATHLETE_COOKIE, JSON.stringify(parsed.athlete), {
      httpOnly: false,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
};

export const postStravaOAuthToken = async (
  formData: URLSearchParams,
): Promise<{status: number; bodyText: string}> => {
  const stravaRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: formData.toString(),
  });
  const bodyText = await stravaRes.text();
  return {status: stravaRes.status, bodyText};
};

export type RefreshFromCookiesResult =
  | {ok: true; parsed: StravaTokenPayload; bodyText: string; status: number}
  | {ok: false; status: number; bodyText: string};

/**
 * Exchange refresh_token (from cookie or body) for new tokens. Validates CSRF.
 * Caller must pass client_id / secret via env (same as token route).
 */
export const refreshStravaTokensFromRequest = async (
  request: NextRequest,
  bodyRefreshToken?: string,
): Promise<RefreshFromCookiesResult> => {
  if (!validateRefreshCsrf(request)) {
    return {ok: false, status: 403, bodyText: JSON.stringify({error: 'CSRF validation failed'})};
  }

  const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? '';
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? '';

  const cookieRefresh = request.cookies.get(STRAVA_REFRESH_COOKIE)?.value;
  const refresh = bodyRefreshToken || cookieRefresh;
  if (!refresh) {
    return {ok: false, status: 400, bodyText: JSON.stringify({error: 'refresh_token required'})};
  }

  const formData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refresh,
  });

  const {status, bodyText} = await postStravaOAuthToken(formData);

  if (!status.toString().startsWith('2')) {
    return {ok: false, status, bodyText};
  }

  try {
    const parsed = JSON.parse(bodyText) as StravaTokenPayload;
    if (!parsed.access_token) {
      return {ok: false, status: 502, bodyText};
    }
    return {ok: true, parsed, bodyText, status};
  } catch {
    return {ok: false, status: 502, bodyText};
  }
};

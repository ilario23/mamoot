import {NextRequest, NextResponse} from 'next/server';

const ACCESS_COOKIE = 'strava_access_token';
const REFRESH_COOKIE = 'strava_refresh_token';
const EXPIRES_COOKIE = 'strava_expires_at';
const CSRF_COOKIE = 'strava_csrf_token';

const validateCsrf = (req: NextRequest): boolean => {
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get('x-csrf-token');
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
};

export async function POST(req: NextRequest) {
  if (!validateCsrf(req)) {
    return NextResponse.json({error: 'CSRF validation failed'}, {status: 403});
  }
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const expiresAtRaw = req.cookies.get(EXPIRES_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({error: 'Not authenticated'}, {status: 401});
  }

  const expiresAt = Number(expiresAtRaw ?? '0');
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (refreshToken && Number.isFinite(expiresAt) && expiresAt - nowEpoch < 300) {
    // Ask token broker to refresh using cookie-backed refresh token.
    await fetch(new URL('/api/strava/token', req.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({grant_type: 'refresh_token'}),
    }).catch(() => {});
  }

  return NextResponse.json({accessToken: token});
}

import {NextRequest, NextResponse} from 'next/server';
import {
  STRAVA_ACCESS_COOKIE,
  STRAVA_EXPIRES_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_CSRF_COOKIE,
  applyStravaTokenPayloadToResponse,
  refreshStravaTokensFromRequest,
} from '@/lib/stravaTokenBroker';

const validateCsrf = (req: NextRequest): boolean => {
  const cookieToken = req.cookies.get(STRAVA_CSRF_COOKIE)?.value;
  const headerToken = req.headers.get('x-csrf-token');
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
};

export async function POST(req: NextRequest) {
  if (!validateCsrf(req)) {
    return NextResponse.json({error: 'CSRF validation failed'}, {status: 403});
  }

  const token = req.cookies.get(STRAVA_ACCESS_COOKIE)?.value;
  const expiresAtRaw = req.cookies.get(STRAVA_EXPIRES_COOKIE)?.value;
  const refreshToken = req.cookies.get(STRAVA_REFRESH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({error: 'Not authenticated'}, {status: 401});
  }

  const expiresAt = Number(expiresAtRaw ?? '0');
  const nowEpoch = Math.floor(Date.now() / 1000);
  const needsRefresh =
    Boolean(refreshToken) &&
    Number.isFinite(expiresAt) &&
    expiresAt - nowEpoch < 300;

  if (needsRefresh) {
    const result = await refreshStravaTokensFromRequest(req);
    if (result.ok && result.parsed.access_token) {
      const res = NextResponse.json({accessToken: result.parsed.access_token});
      applyStravaTokenPayloadToResponse(res, result.parsed);
      return res;
    }
    if (expiresAt <= nowEpoch) {
      return NextResponse.json({error: 'Session expired'}, {status: 401});
    }
    return NextResponse.json({accessToken: token});
  }

  return NextResponse.json({accessToken: token});
}

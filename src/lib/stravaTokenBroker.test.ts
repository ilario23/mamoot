import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {NextRequest} from 'next/server';
import {
  refreshStravaTokensFromRequest,
  validateRefreshCsrf,
} from './stravaTokenBroker';

describe('stravaTokenBroker', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID = 'cid';
    process.env.STRAVA_CLIENT_SECRET = 'sec';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validateRefreshCsrf rejects mismatched tokens', () => {
    const req = new NextRequest('http://localhost/api', {
      headers: {
        cookie: 'strava_csrf_token=abc',
        'x-csrf-token': 'wrong',
      },
    });
    expect(validateRefreshCsrf(req)).toBe(false);
  });

  it('validateRefreshCsrf accepts matching cookie and header', () => {
    const req = new NextRequest('http://localhost/api', {
      headers: {
        cookie: 'strava_csrf_token=match',
        'x-csrf-token': 'match',
      },
    });
    expect(validateRefreshCsrf(req)).toBe(true);
  });

  it('refreshStravaTokensFromRequest returns not ok on CSRF failure', async () => {
    const req = new NextRequest('http://localhost/api', {
      headers: {'x-csrf-token': 'only-header'},
    });
    const result = await refreshStravaTokensFromRequest(req);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('refreshStravaTokensFromRequest calls Strava and returns parsed tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              access_token: 'new-access',
              refresh_token: 'new-refresh',
              expires_at: 9999999999,
            }),
          ),
      }),
    );

    const req = new NextRequest('http://localhost/api', {
      headers: {
        cookie: 'strava_csrf_token=tok; strava_refresh_token=old-refresh',
        'x-csrf-token': 'tok',
      },
    });

    const result = await refreshStravaTokensFromRequest(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.access_token).toBe('new-access');
    }
    expect(global.fetch).toHaveBeenCalled();
  });
});

import {describe, expect, it} from 'vitest';
import {NextRequest} from 'next/server';

describe('db route auth defaults', () => {
  it('blocks unauthorized requests in production by default', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.DB_ROUTE_ENFORCE_AUTH;

    const mod = await import('../../app/api/db/[table]/route');
    const req = new NextRequest('http://localhost/api/db/activities?athleteId=123');
    const response = await mod.GET(req, {
      params: Promise.resolve({table: 'activities'}),
    });

    expect(response.status).toBe(401);
  });

  it('blocks mismatched athlete scope with x-athlete-id', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.DB_ROUTE_ENFORCE_AUTH;

    const mod = await import('../../app/api/db/[table]/route');
    const req = new NextRequest('http://localhost/api/db/activities?athleteId=123', {
      headers: {'x-athlete-id': '999'},
    });
    const response = await mod.GET(req, {
      params: Promise.resolve({table: 'activities'}),
    });

    expect(response.status).toBe(403);
  });
});

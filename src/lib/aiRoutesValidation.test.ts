import {describe, expect, it} from 'vitest';

describe('AI route request validation', () => {
  it('rejects invalid JSON in weekly-plan route before model calls', async () => {
    process.env.DATABASE_URL = 'postgres://ci:ci@localhost:5432/ci';
    const mod = await import('../../app/api/ai/weekly-plan/route');
    const req = new Request('http://localhost/api/ai/weekly-plan', {
      method: 'POST',
      body: '{invalid-json',
      headers: {'Content-Type': 'application/json'},
    });
    const response = await mod.POST(req);
    expect(response.status).toBe(400);
  });

  it('rejects malformed request body in chat route', async () => {
    process.env.DATABASE_URL = 'postgres://ci:ci@localhost:5432/ci';
    const mod = await import('../../app/api/ai/chat/route');
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({persona: 'coach', messages: []}),
      headers: {'Content-Type': 'application/json'},
    });
    const response = await mod.POST(req);
    expect(response.status).toBe(400);
  });
});

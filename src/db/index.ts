// ============================================================
// Neon + Drizzle Database Connection
// ============================================================
//
// Uses Neon's HTTP-based serverless driver — each query is a single
// HTTP request with no persistent connection. Perfect for Next.js
// API routes and server components.
//
// Lazy init: `next build` evaluates route modules without DATABASE_URL;
// only call `getDb()` when handling a request that needs the DB.

import {neon} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-http';
import type {NeonHttpDatabase} from 'drizzle-orm/neon-http';
import * as schema from './schema';

let cached: NeonHttpDatabase<typeof schema> | undefined;

export const getDb = (): NeonHttpDatabase<typeof schema> => {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Add it to your environment (e.g. .env.local for dev, CI secrets for deployments).',
    );
  }
  const sql = neon(url);
  cached = drizzle(sql, {schema});
  return cached;
};

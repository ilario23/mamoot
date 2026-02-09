// ============================================================
// Neon + Drizzle Database Connection
// ============================================================
//
// Uses Neon's HTTP-based serverless driver — each query is a single
// HTTP request with no persistent connection. Perfect for Next.js
// API routes and server components.

import {neon} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, {schema});

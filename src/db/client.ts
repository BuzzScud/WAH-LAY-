import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url =
  process.env.DATABASE_URL ?? 'postgres://takeout:takeout@localhost:5432/takeout';

// Reuse one pool across dev HMR reloads.
const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };
const client = globalForDb.__pgClient ?? postgres(url, { max: 10 });
globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema };

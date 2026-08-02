// Applies committed SQL migrations from ./drizzle before the server starts.
// Uses only production deps (drizzle-orm + postgres), so the runtime image
// does not need drizzle-kit or TypeScript.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(url, { max: 1, connect_timeout: 10 });
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('migrate: up to date');
} catch (e) {
  console.error('migrate: failed', e);
  process.exit(1);
} finally {
  await client.end();
}

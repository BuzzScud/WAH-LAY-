// Applies committed SQL migrations from ./drizzle before the server starts.
// Uses only production deps (drizzle-orm + postgres), so the runtime image
// does not need drizzle-kit or TypeScript.
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Fill in anything missing from a local .env.
 *
 * Docker (`env_file:`) and systemd (`EnvironmentFile=`) both supply the
 * environment already, and those paths are untouched — existing values always
 * win. This only covers running the script by hand on a server, where nothing
 * loads .env and the failure ("DATABASE_URL is not set") reads like a config
 * error rather than a missing shell step. Hand-parsed on purpose: this runs in
 * the runtime image, which installs production dependencies only.
 */
function loadDotEnv(file = '.env') {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return; // absent is the normal case in a container
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadDotEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set (checked the environment and ./.env)');
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

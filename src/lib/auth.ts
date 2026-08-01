/**
 * Auth without a platform (plan §6 phase 2): one owner account, bcrypt hash,
 * signed-nothing — a random server-side session token in an HTTP-only cookie.
 * No public signup route exists at all.
 *
 * Kitchen devices (Addendum B2): /kitchen shows customer names and phone
 * numbers, so it is NOT public. The tablet visits /kitchen?token=<KITCHEN_TOKEN>
 * once; a long-lived device cookie is set. Rotate KITCHEN_TOKEN to revoke.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { AstroCookies } from 'astro';
import { db, schema } from '@/db/client';

const SESSION_COOKIE = 'session';
const KITCHEN_COOKIE = 'kitchen_device';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function verifyLogin(username: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
  if (!user) {
    // Burn comparable time so a missing user is indistinguishable.
    await bcrypt.compare(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7lZk0Yl1s0iBBB1S6zRkhSNMuxxxxxx');
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function createSession(cookies: AstroCookies, userId: number) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ token, userId, expiresAt });
  // Opportunistic cleanup of expired sessions.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(cookies: AstroCookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getSessionUser(cookies: AstroCookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.token, token) });
  if (!session || session.expiresAt < new Date()) return null;
  return await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True if this request carries a valid kitchen device cookie (or owner session). */
export function hasKitchenAccess(cookies: AstroCookies): boolean {
  const expected = process.env.KITCHEN_TOKEN;
  if (!expected) return false;
  const cookie = cookies.get(KITCHEN_COOKIE)?.value;
  return !!cookie && safeEqual(cookie, expected);
}

/** Called by /kitchen?token=… to enroll the tablet as a device. */
export function enrollKitchenDevice(cookies: AstroCookies, presentedToken: string): boolean {
  const expected = process.env.KITCHEN_TOKEN;
  if (!expected || !safeEqual(presentedToken, expected)) return false;
  cookies.set(KITCHEN_COOKIE, expected, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // long-lived device cookie
  });
  return true;
}

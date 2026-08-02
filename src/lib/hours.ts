/**
 * Open/closed logic (plan §7.1). One IANA timezone, evaluated server-side.
 * Local wall-clock times combined with today's date via Intl — never a fixed
 * UTC offset, so DST is handled by the platform's tzdata.
 */
import { db, schema } from '@/db/client';

export type StoreSettings = typeof schema.storeSettings.$inferSelect;
type HoursRow = typeof schema.businessHours.$inferSelect;
type ClosureRow = typeof schema.closures.$inferSelect;

/** Wall-clock "now" in the store's timezone. */
export function storeNow(tz: string, at: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hour = Number(get('hour')) % 24; // Intl can emit "24" at midnight
  const minute = Number(get('minute'));
  return {
    weekday: weekdayIndex,
    minutes: hour * 60 + minute, // minutes since local midnight
    dateStr: `${get('year')}-${get('month')}-${get('day')}`, // YYYY-MM-DD local
  };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export interface OpenState {
  /** Store is within a service window right now (show as open). */
  isOpen: boolean;
  /** Orders are currently accepted (open, not past last call, not paused). */
  acceptingOrders: boolean;
  /** Human-readable reason when not accepting. */
  reason: string | null;
}

/**
 * The single source of truth. The client-side countdown is a courtesy; the
 * server check on submit is what rejects the 9:31 order for a 9:30 kitchen.
 */
export async function getOpenState(at: Date = new Date()): Promise<OpenState> {
  const settings = await db.query.storeSettings.findFirst();
  if (!settings) return { isOpen: false, acceptingOrders: false, reason: 'Store not configured' };

  const now = storeNow(settings.timezone, at);

  // Closures (Lunar New Year, staff vacation…) override the weekly schedule.
  const todaysClosures: ClosureRow[] = await db.query.closures.findMany();
  const closure = todaysClosures.find((c) => c.date === now.dateStr);
  let windows: { open: number; close: number; lastOrderOffset: number }[];

  if (closure?.allDay) {
    return {
      isOpen: false,
      acceptingOrders: false,
      reason: closure.reason ? `Closed today — ${closure.reason}` : 'Closed today',
    };
  }

  // A close at or before the open time means the window runs past midnight
  // (11:00–00:00, or 17:00–02:00): extend close into tomorrow's minutes.
  const span = (open: number, close: number) => (close <= open ? close + 1440 : close);

  if (closure && closure.openTime && closure.closeTime) {
    windows = [
      {
        open: toMinutes(closure.openTime),
        close: span(toMinutes(closure.openTime), toMinutes(closure.closeTime)),
        lastOrderOffset: 20,
      },
    ];
  } else {
    const rows: HoursRow[] = await db.query.businessHours.findMany();
    const forDay = (day: number, shift: number) =>
      rows
        .filter((r) => r.dayOfWeek === day)
        .map((r) => ({
          open: toMinutes(r.openTime) + shift,
          close: span(toMinutes(r.openTime), toMinutes(r.closeTime)) + shift,
          lastOrderOffset: r.lastOrderOffsetMinutes,
        }));
    // Yesterday's windows shifted back a day so one spanning midnight (e.g.
    // Fri 17:00–02:00) still covers Sat 01:30.
    windows = [...forDay(now.weekday, 0), ...forDay((now.weekday + 6) % 7, -1440)];
  }

  const inWindow = windows.find((w) => now.minutes >= w.open && now.minutes < w.close);
  if (!inWindow) {
    return { isOpen: false, acceptingOrders: false, reason: 'Closed right now' };
  }

  // Last call: stop new orders before close so the kitchen is not cooking
  // past closing (per service window — lunch and dinner often differ).
  const pastLastCall = now.minutes >= inWindow.close - inWindow.lastOrderOffset;
  if (settings.orderingPaused) {
    return {
      isOpen: true,
      acceptingOrders: false,
      reason: 'Online ordering is paused right now — please call us',
    };
  }
  if (pastLastCall) {
    return {
      isOpen: true,
      acceptingOrders: false,
      reason: 'Last call for online orders has passed — please call us',
    };
  }
  return { isOpen: true, acceptingOrders: true, reason: null };
}

/**
 * ASAP pickup time quoted from CURRENT prep time, not closing time
 * (plan §7.1 "ASAP quoting near close").
 */
export function quotePickupAt(prepTimeMinutes: number, offsetMinutes: number): Date {
  return new Date(Date.now() + (prepTimeMinutes + offsetMinutes) * 60_000);
}

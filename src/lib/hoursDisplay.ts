/**
 * Turning the weekly hours rows into something a hungry person can read.
 * Presentation only — `lib/hours.ts` remains the authority on whether the
 * store is actually open.
 *
 * Weeks render Monday-first: Wah Lay is closed Mondays, and "Closed" reading
 * first is more useful than it being buried mid-table.
 */
type HoursRow = { dayOfWeek: number; openTime: string; closeTime: string };

/** DB uses 0 = Sunday; this is the display order. */
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh} ${suffix}` : `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Today's index (0 = Sunday) in the store's timezone. */
export function todayIndex(timezone: string): number {
  return DAY_SHORT.indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date())
  );
}

const label = (rows: HoursRow[]) =>
  rows.length === 0 ? 'Closed' : rows.map((r) => `${formatTime(r.openTime)} – ${formatTime(r.closeTime)}`).join(', ');

export interface DayRow {
  index: number;
  name: string;
  short: string;
  hours: string;
  closed: boolean;
}

/** All seven days, Monday first. */
export function week(hours: HoursRow[]): DayRow[] {
  return MON_FIRST.map((index) => {
    const rows = hours.filter((h) => h.dayOfWeek === index);
    return {
      index,
      name: DAY_NAMES[index],
      short: DAY_SHORT[index],
      hours: label(rows),
      closed: rows.length === 0,
    };
  });
}

export interface DayGroup {
  days: string;
  hours: string;
  /** True when today falls inside this group, for highlighting. */
  includesToday: boolean;
}

/** Consecutive days with identical hours collapse: "Tue – Thu · 11 AM – 9:30 PM". */
export function groupedWeek(hours: HoursRow[], today = -1): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const day of week(hours)) {
    const last = groups[groups.length - 1];
    if (last && last.hours === day.hours) {
      last.days = `${last.days.split(' – ')[0]} – ${day.short}`;
      last.includesToday ||= day.index === today;
    } else {
      groups.push({ days: day.short, hours: day.hours, includesToday: day.index === today });
    }
  }
  return groups;
}

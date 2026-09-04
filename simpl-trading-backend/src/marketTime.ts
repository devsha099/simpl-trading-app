/**
 * Eastern-time helpers for the Trade Limits feature (CLAUDE.md §17).
 *
 * Everything here is deliberately ET, never UTC and never the server's local
 * zone: a "Monday–Friday week" and a "9:30 AM next trading day" only mean
 * anything relative to the market's own clock. Computing either in UTC would
 * roll the week over at the wrong moment for most of the world, and would
 * drift by an hour twice a year across DST.
 *
 * No date library — Intl is enough, and this is the whole of the date math in
 * the codebase.
 */
const ET = "America/New_York";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

type EtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function etParts(date: Date): EtParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl renders midnight as hour "24" in some ICU versions; normalize.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

/**
 * Convert an ET wall-clock time to the real UTC instant it refers to.
 *
 * The offset (EST -5 / EDT -4) depends on the very instant we're solving for,
 * so this guesses, measures the actual offset at that guess, corrects, and
 * measures once more. Two passes settle every case including the DST
 * boundaries, where the first correction can land on the other side of the
 * transition.
 */
function etWallClockToInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = naiveUtc;
  for (let pass = 0; pass < 2; pass++) {
    const p = etParts(new Date(instant));
    const renderedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const offset = renderedAsUtc - instant;
    instant = naiveUtc - offset;
  }
  return new Date(instant);
}

/** Monday 00:00:00 ET of the week containing `now`. Sat/Sun belong to the week just ended. */
export function startOfTradingWeekET(now: Date = new Date()): Date {
  const p = etParts(now);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  // Sunday (0) is 6 days after the Monday that started its week, not 1 day before the next one.
  const daysSinceMonday = dayIndex === 0 ? 6 : dayIndex - 1;
  const midnightToday = etWallClockToInstant(p.year, p.month, p.day, 0, 0);
  return new Date(midnightToday.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

/**
 * The next weekday 9:30 AM ET strictly after `now` — when a cooldown-delayed
 * limit change becomes effective.
 *
 * Known limitation: market holidays are not accounted for (that would need
 * Alpaca's calendar endpoint on every settings save). A change queued before a
 * holiday activates at 9:30 that morning instead of the next actual session.
 * The effect is that it lands slightly earlier than a strict reading, never
 * later, so it can't silently extend a lock beyond what the user was told.
 */
export function nextMarketOpenET(now: Date = new Date()): Date {
  const p = etParts(now);
  let candidate = etWallClockToInstant(p.year, p.month, p.day, 9, 30);
  // Already past today's open (or exactly on it) — start from tomorrow.
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  // Skip weekends. Re-derive the wall clock each hop so a DST change inside
  // the skip can't shift 9:30 into 8:30 or 10:30.
  for (let i = 0; i < 7; i++) {
    const cp = etParts(candidate);
    if (cp.weekday !== "Sat" && cp.weekday !== "Sun") {
      return etWallClockToInstant(cp.year, cp.month, cp.day, 9, 30);
    }
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

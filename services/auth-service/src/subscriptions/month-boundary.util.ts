/**
 * Phase 6 (Part 28): the monthly ticket limit resets on calendar-month
 * boundaries in the *organization's* configured timezone (Organization.timezone,
 * already used for display purposes since Phase 3), not the server's local
 * time or naive UTC. There is no timezone-math dependency in this codebase,
 * so this is implemented with only `Intl.DateTimeFormat`:
 *
 * 1. Format `now` in the target timezone to read its local (year, month).
 * 2. Build a UTC instant for "YYYY-MM-01T00:00:00" — this is *not yet*
 *    correct, since that instant is midnight UTC, not midnight local.
 * 3. Re-format that instant in the target timezone and diff it against
 *    itself to get the zone's UTC offset at that moment, then shift the
 *    instant by that offset. The result is the actual UTC instant at which
 *    it becomes midnight on the 1st in the organization's timezone.
 *
 * This is accurate for every real IANA zone, including ones with non-whole-hour
 * offsets (e.g. Asia/Kolkata). The one edge case it does not special-case is a
 * DST transition landing exactly on the 1st at midnight (vanishingly rare, and
 * off by at most an hour if it happens) — acceptable for a monthly usage
 * boundary, not a legal/financial cutoff.
 */
export function startOfCurrentMonthInTimezone(timezone: string, now: Date = new Date()): Date {
  const { year, month } = readYearMonth(timezone, now);
  const naiveUtcMidnight = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, new Date(naiveUtcMidnight));
  return new Date(naiveUtcMidnight - offsetMinutes * 60_000);
}

function readYearMonth(timezone: string, date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return { year, month };
}

/** Minutes to ADD to a UTC instant to get that zone's local wall-clock time. */
function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/**
 * When a beat next sends (07 step 7.11). Pure, so it can be tested hard.
 *
 * Everything is worked out in the church's timezone: "Tuesday 18:00" means
 * 18:00 in Arusha whatever the server's clock says. The jitter moves it a
 * random few minutes later, so a weekly reminder does not arrive like an
 * alarm. A time that falls in quiet hours waits until they end.
 */
export type Rhythm = {
  /** 1 = Monday … 7 = Sunday. */
  daysOfWeek: number[];
  /** 'HH:MM', church time. */
  timeOfDay: string;
  jitterMinutes: number;
  /** Calendar dates, read in the church's timezone. */
  startsOn: Date;
  endsOn: Date | null;
};

type Wall = { y: number; m: number; d: number; hh: number; mm: number; dow: number };

/** The wall clock in that timezone at that instant. */
export function wallClock(at: Date, timeZone: string): Wall {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday!) + 1;
  return {
    y: +parts.year!,
    m: +parts.month!,
    d: +parts.day!,
    hh: +parts.hour!,
    mm: +parts.minute!,
    dow,
  };
}

/** The instant a wall-clock time happens in that timezone. */
export function atWall(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (t: number) => {
    const w = wallClock(new Date(t), timeZone);
    return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm) - t;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** The quiet window, 'HH:MM-HH:MM', which may run past midnight. */
export function inQuiet(minuteOfDay: number, quiet: string): boolean {
  const [start, end] = quiet.split('-').map(minutes) as [number, number];
  if (start === end) return false;
  return start < end
    ? minuteOfDay >= start && minuteOfDay < end
    : minuteOfDay >= start || minuteOfDay < end;
}

/** The instant quiet hours end, if `at` is inside them; otherwise `at`. */
export function afterQuiet(at: Date, timeZone: string, quiet: string): Date {
  const w = wallClock(at, timeZone);
  const now = w.hh * 60 + w.mm;
  if (!inQuiet(now, quiet)) return at;
  const end = minutes(quiet.split('-')[1]!);
  // Early morning, before the end: today. Late evening: tomorrow.
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d + (now < end ? 0 : 1)));
  return atWall(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    Math.floor(end / 60),
    end % 60,
    timeZone,
  );
}

/** The next time it sends strictly after `after`, or null once it has ended. */
export function nextRun(
  rhythm: Rhythm,
  after: Date,
  timeZone: string,
  quiet: string,
  random: () => number = Math.random,
): Date | null {
  if (!rhythm.daysOfWeek.length) return null;
  const [hh, mm] = rhythm.timeOfDay.split(':').map(Number) as [number, number];
  const today = wallClock(after, timeZone);
  const startsOn = Date.UTC(
    rhythm.startsOn.getUTCFullYear(),
    rhythm.startsOn.getUTCMonth(),
    rhythm.startsOn.getUTCDate(),
  );
  const endsOn = rhythm.endsOn
    ? Date.UTC(
        rhythm.endsOn.getUTCFullYear(),
        rhythm.endsOn.getUTCMonth(),
        rhythm.endsOn.getUTCDate(),
      )
    : null;

  let day = Math.max(Date.UTC(today.y, today.m - 1, today.d), startsOn);
  for (let i = 0; i < 400; i++, day += 86_400_000) {
    if (endsOn !== null && day > endsOn) return null;
    const d = new Date(day);
    const dow = ((d.getUTCDay() + 6) % 7) + 1;
    if (!rhythm.daysOfWeek.includes(dow)) continue;
    const base = atWall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hh, mm, timeZone);
    const jitter = Math.floor(random() * (Math.max(0, rhythm.jitterMinutes) + 1));
    const at = afterQuiet(new Date(base.getTime() + jitter * 60_000), timeZone, quiet);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

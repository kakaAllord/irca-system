import { describe, expect, it } from 'vitest';
import { afterQuiet, nextRun, type Rhythm } from './next-run.js';

const TZ = 'Africa/Dar_es_Salaam'; // UTC+3, no daylight saving
const QUIET = '21:00-07:00';
const none = () => 0;
const date = (s: string) => new Date(`${s}T00:00:00Z`);
/** An Arusha wall-clock time as an instant. */
const arusha = (s: string) => new Date(`${s}+03:00`);

const tuesdays: Rhythm = {
  daysOfWeek: [2],
  timeOfDay: '18:00',
  jitterMinutes: 0,
  startsOn: date('2026-09-01'),
  endsOn: null,
};

describe('when a beat next sends', () => {
  it('finds the next Tuesday at 18:00 in Arusha, whatever the server clock says', () => {
    // Thursday 24 September 2026, 10:00 in Arusha.
    expect(nextRun(tuesdays, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-29T18:00'),
    );
    // On a Tuesday before six, it is that evening; after six, next week.
    expect(nextRun(tuesdays, arusha('2026-09-29T17:59'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-29T18:00'),
    );
    expect(nextRun(tuesdays, arusha('2026-09-29T18:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-10-06T18:00'),
    );
  });

  it('crosses the end of a month and a year', () => {
    expect(nextRun(tuesdays, arusha('2026-12-30T09:00'), TZ, QUIET, none)).toEqual(
      arusha('2027-01-05T18:00'),
    );
  });

  it('sends on Sundays only when asked for Sundays', () => {
    const sundays = { ...tuesdays, daysOfWeek: [7], timeOfDay: '08:30' };
    expect(nextRun(sundays, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-27T08:30'),
    );
  });

  it('waits for its first day, and stops after its last', () => {
    const later = { ...tuesdays, startsOn: date('2026-10-10') };
    expect(nextRun(later, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-10-13T18:00'),
    );
    // Ends on Wednesday 30 September: Tuesday the 29th is its last.
    const ending = { ...tuesdays, endsOn: date('2026-09-30') };
    expect(nextRun(ending, arusha('2026-09-29T19:00'), TZ, QUIET, none)).toBeNull();
  });

  it('never sends in quiet hours: a time inside them waits until morning', () => {
    const late = { ...tuesdays, timeOfDay: '22:30' };
    expect(nextRun(late, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-30T07:00'),
    );
    const early = { ...tuesdays, timeOfDay: '05:00' };
    expect(nextRun(early, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-29T07:00'),
    );
    expect(afterQuiet(arusha('2026-09-24T14:00'), TZ, QUIET)).toEqual(arusha('2026-09-24T14:00'));
  });

  it('moves a few minutes later by its jitter, and jitter into quiet hours still waits', () => {
    const jittery = { ...tuesdays, jitterMinutes: 20 };
    const at = nextRun(jittery, arusha('2026-09-24T10:00'), TZ, QUIET, () => 0.99)!;
    expect(at).toEqual(arusha('2026-09-29T18:20'));
    const edge = { ...tuesdays, timeOfDay: '20:55', jitterMinutes: 10 };
    expect(nextRun(edge, arusha('2026-09-24T10:00'), TZ, QUIET, () => 0.99)).toEqual(
      arusha('2026-09-30T07:00'),
    );
  });

  it('sends in the chosen weeks of the month only: the first Monday at ten', () => {
    const monthly: Rhythm = {
      ...tuesdays,
      daysOfWeek: [1],
      weeksOfMonth: [1],
      timeOfDay: '10:00',
    };
    // Thursday 24 September 2026: the next first Monday is 5 October.
    expect(nextRun(monthly, arusha('2026-09-24T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-10-05T10:00'),
    );
    // After it, the one in November: Monday 2 November.
    expect(nextRun(monthly, arusha('2026-10-05T10:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-11-02T10:00'),
    );
    // The third Friday: 18 September 2026 is the third, 25th the fourth.
    const third = { ...monthly, daysOfWeek: [5], weeksOfMonth: [3] };
    expect(nextRun(third, arusha('2026-09-01T00:00'), TZ, QUIET, none)).toEqual(
      arusha('2026-09-18T10:00'),
    );
  });
});

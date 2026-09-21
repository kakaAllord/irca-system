import {
  STEPS, applicableSteps, labelOf, stepGroups, t, type Lang, type Step, type Values,
} from './flow';
import { isAnswered } from './validate';
import type { Registration } from './registration';

/**
 * Where people get to, and what they leave blank.
 *
 * All of it is derived from the registrations table rather than an event log.
 * Every question this needs to answer is a fact about the row as it stands:
 *
 *   reached   the step is on their path and they got at least this far
 *   answered  isAnswered, the same rule the flow itself uses
 *   blank     they reached it, moved past it, and left it empty
 *   stopped   they are unfinished and this is the furthest they got
 *
 * An events table would buy per-visit timing and repeat visits, and cost a
 * write on every interaction. For a flow with a fixed set of questions and a
 * couple of dozen visitors a Sunday, the row already says everything needed.
 */

export type StepInsight = {
  id: string;
  label: string;
  optional: boolean;
  reached: number;
  answered: number;
  blank: number;
  stopped: number;
  /** Of those who reached it, how many answered. */
  answeredPct: number;
  /** Of those who reached it and moved on, how many left it blank. */
  blankPct: number;
  /** Of everyone who started, how many gave up here. */
  stoppedPct: number;
};

export type OptionInsight = {
  stepId: string;
  label: string;
  options: { value: string; label: string; count: number; pct: number }[];
  /** How many people answered this question at all, the base for pct. */
  base: number;
};

export type Insights = {
  started: number;
  submitted: number;
  inProgress: number;
  completionPct: number;
  dropOffPct: number;
  steps: StepInsight[];
  options: OptionInsight[];
};

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);

/** Where this person got to, as an index into their own step order. */
function furthestIndex(reg: Registration, order: string[]): number {
  if (reg.status === 'submitted') return order.length;
  const step = reg.furthestStep ?? reg.currentStep;
  if (!step) return -1;
  // Sits past the last question, so everything before it was reached.
  if (step === 'done') return order.length;
  return order.indexOf(step);
}

export function computeInsights(rows: Registration[], lang: Lang): Insights {
  const started = rows.length;
  const submitted = rows.filter(r => r.status === 'submitted').length;

  const steps: StepInsight[] = STEPS.map(step => ({
    id: step.id,
    label: t(step.short, lang),
    optional: !step.req,
    reached: 0,
    answered: 0,
    blank: 0,
    stopped: 0,
    answeredPct: 0,
    blankPct: 0,
    stoppedPct: 0,
  }));
  const byId = new Map(steps.map(s => [s.id, s]));

  for (const reg of rows) {
    // Each person is measured against the questions they were actually shown:
    // someone who is not joining the church was never asked where they study,
    // and must not count as having skipped it.
    const mine = applicableSteps(reg.values);
    const order = mine.map(s => s.id);
    const furthest = furthestIndex(reg, order);

    mine.forEach((step, i) => {
      const row = byId.get(step.id);
      if (!row) return;
      if (i > furthest) return;

      row.reached++;
      if (isAnswered(step, reg.values, reg.lang)) row.answered++;
      else if (i < furthest) row.blank++;

      if (reg.status === 'in_progress' && i === furthest) row.stopped++;
    });
  }

  for (const s of steps) {
    s.answeredPct = pct(s.answered, s.reached);
    s.blankPct = pct(s.blank, s.reached);
    s.stoppedPct = pct(s.stopped, started);
  }

  return {
    started,
    submitted,
    inProgress: started - submitted,
    completionPct: pct(submitted, started),
    dropOffPct: pct(started - submitted, started),
    steps: steps.filter(s => s.reached > 0 || started === 0),
    options: optionInsights(rows, lang),
  };
}

/**
 * What people actually pick, for the questions that offer a list.
 *
 * This is the half that tells the office whether a question is earning its
 * place: an option nobody ever chooses is a line to cut, and one everybody
 * chooses may be worth splitting.
 */
function optionInsights(rows: Registration[], lang: Lang): OptionInsight[] {
  const out: OptionInsight[] = [];

  // One entry per question, not per screen: two questions sharing a screen are
  // still two things the office needs counted separately.
  for (const step of STEPS) {
    for (const group of stepGroups(step)) {
      const key = group.key;

      const counts = new Map<string, number>();
      let base = 0;

      for (const reg of rows) {
        if (!applicableSteps(reg.values).some(s => s.id === step.id)) continue;
        const val = reg.values[key] as string[] | string;
        const chosen = Array.isArray(val) ? val : val ? [val] : [];
        if (!chosen.length) continue;
        base++;
        for (const c of chosen) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      if (!base) continue;

      out.push({
        stepId: `${step.id}:${key}`,
        label: t(group.label, lang),
        base,
        options: group.opts
          .map(o => ({
            value: o.val,
            label: labelOf(key as string, o.val, lang),
            count: counts.get(o.val) ?? 0,
            pct: pct(counts.get(o.val) ?? 0, base),
          }))
          .sort((a, b) => b.count - a.count),
      });
    }
  }

  return out;
}

/** The question a step belongs to, for the insights table's tooltip. */
export function stepQuestion(step: Step, lang: Lang): string {
  return t(step.q, lang);
}

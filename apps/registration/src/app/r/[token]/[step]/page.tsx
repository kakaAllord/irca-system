import { notFound, redirect } from 'next/navigation';
import { Device } from '@/components/Device';
import StepScreen from '@/components/StepScreen';
import { applicableSteps, progress, screenIds, stepById } from '@/lib/flow';
import { getByToken } from '@/lib/registration';
import { isAnswered } from '@/lib/validate';

/**
 * One question, one URL. Everything else follows from this: the browser's back
 * button works, a refresh keeps your place, and the link the office sends can
 * point at the exact question someone stopped on.
 */
export default async function StepPage({
  params,
}: {
  params: Promise<{ token: string; step: string }>;
}) {
  const { token, step: stepId } = await params;

  const reg = await getByToken(token);
  if (!reg) notFound();
  if (reg.status === 'submitted') redirect(`/r/${token}/done`);

  const step = stepById(stepId);
  if (!step) notFound();

  // A step can stop applying after the fact — un-ticking "I want to join the
  // church" makes /faith meaningless. Rather than 404 on a link that was valid
  // an hour ago, send them to where they actually are in the flow: the first
  // question still waiting on them, the same place the resume link lands. The
  // first step of all would be the start, marching someone who backed out of a
  // branch back through everything they had already answered.
  const steps = applicableSteps(reg.values);
  if (!steps.some(s => s.id === stepId)) {
    const outstanding = steps.filter(st => !isAnswered(st, reg.values, reg.lang));
    redirect(`/r/${token}/${outstanding[0]?.id ?? steps[steps.length - 1]?.id ?? 'done'}`);
  }

  const ids = screenIds(reg.values);
  const here = ids.indexOf(stepId);
  // From the very first question, back means the language screen, in the mode
  // that changes this registration rather than starting another one.
  const backHref = here > 0
    ? `/r/${token}/${ids[here - 1]}`
    : `/?change=${token}&from=${stepId}`;
  const { pct } = progress(reg.values, stepId);

  return (
    <Device>
      <StepScreen
        token={token}
        stepId={stepId}
        lang={reg.lang}
        values={reg.values}
        backHref={backHref}
        pct={pct}
      />
    </Device>
  );
}

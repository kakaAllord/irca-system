import type { Metadata } from 'next';
import { Guide, Step } from '../Guide';

export const metadata: Metadata = { title: 'Finance in five minutes' };

export default function FinanceGuidePage() {
  return (
    <Guide
      title="Finance in five minutes"
      intro="For the people who record the church's money: the five things you do most."
    >
      <Step n={1} title="Record an expense">
        <p>
          <strong>Finance → Transactions → + Record expense.</strong> Income is the same, from{' '}
          <strong>+ Record income</strong>.
        </p>
        <p>
          In <strong>Expense item</strong>, start typing what it was for: &ldquo;fuel&rdquo;,
          &ldquo;electricity&rdquo;. Pick the item from the suggestions, so the same thing is always
          recorded under the same name. If it is genuinely new and you are allowed to add items,
          choose <strong>＋ Create expense item</strong> at the bottom of the list; otherwise ask a
          finance manager to add it.
        </p>
        <p>
          Fill in the date, the amount, and how it was <strong>Paid by</strong> (cash, mobile money,
          bank transfer…). <strong>Reference</strong> is for the M-Pesa code, receipt or cheque
          number, and is worth filling in: it is how an entry is found again. Then{' '}
          <strong>Save expense</strong>.
        </p>
      </Step>

      <Step n={2} title="A stack of receipts at once">
        <p>
          After saving, choose <strong>Record another expense</strong>. The date and how it was paid
          stay filled in, and everything else is cleared, so a day&apos;s receipts go in one after
          another without starting over.
        </p>
      </Step>

      <Step n={3} title="Read an entry number">
        <p>
          Every entry gets a number when it is saved, such as{' '}
          <strong>IRCA-EXP-2026-09-000014</strong>: the church, EXP for an expense or INC for
          income, the year and month of the entry&apos;s date, and its place in that month. Write it
          on the paper receipt. Numbers are never reused, and there are no gaps.
        </p>
      </Step>

      <Step n={4} title="Void a mistake">
        <p>
          A saved entry is never edited or deleted directly; that is what makes the books worth
          trusting. Open the entry, choose <strong>Request a change ▾</strong>, then{' '}
          <strong>Void this entry</strong> (or <strong>Correct this entry</strong> for a wrong
          amount or date), and say what was wrong.
        </p>
        <p>
          An administrator approves or rejects it in <strong>Admin → Requests</strong>. Nobody can
          approve their own request. Until then the entry stands, marked as waiting; you can follow
          it under <strong>Finance → Requests</strong>.
        </p>
      </Step>

      <Step n={5} title="Print the monthly statement">
        <p>
          <strong>Finance → Reports</strong>, choose <strong>Last month</strong> (or any range), and{' '}
          <strong>Print</strong>. The printout is only the statement, without the menus. To send it
          rather than print it, choose &ldquo;Save as PDF&rdquo; as the printer.
        </p>
      </Step>

      <Step n={6} title="Record a payment towards a pledge">
        <p>
          When someone brings money they promised, open <strong>Finance → Pledges</strong> and
          choose <strong>+ Record a payment</strong>. Type part of their name or phone number, pick
          their pledge, enter the amount, and if you also recorded it as income, choose that entry
          so the books and the pledge agree. You are told what is left.
        </p>
        <p>
          You never see the list of who owes what: only the finance manager and the pastors do. A
          payment typed wrongly is corrected like any entry: open the pledge, choose{' '}
          <strong>Ask to change</strong> beside the payment, and an administrator decides.
        </p>
      </Step>
    </Guide>
  );
}

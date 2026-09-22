#!/usr/bin/env node
// Fails on any dependency advisory that is not written down below.
//
// `npm audit` on its own is all or nothing: one unfixable advisory in a
// transitive package makes it red forever, and a permanently red check is a
// check nobody reads. This one is red for anything new, and green for what has
// been looked at and explained — with the date it was looked at, so an
// exception cannot quietly become permanent.
import { execFileSync } from 'node:child_process';

/* eslint-disable no-console -- a command-line check reports to its terminal */

/** Advisories we have read, and why they do not apply here. Review each on its date. */
const ACCEPTED = [
  {
    url: 'https://github.com/advisories/GHSA-3f6p-5ww8-9rcr',
    why: 'mysql2, reached only through Prisma\'s MySQL adapter. This system talks to PostgreSQL through @prisma/adapter-pg; the MySQL driver is never loaded. The only "fix" is Prisma 6, a downgrade.',
    reviewBy: '2027-03-01',
  },
  {
    url: 'https://github.com/advisories/GHSA-rgwj-5xj2-c3m3',
    why: 'mysql2 again, same reason: no MySQL connection exists.',
    reviewBy: '2027-03-01',
  },
  {
    url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
    why: 'deepmerge-ts, inside @prisma/config, which merges our own prisma.config.ts at startup. The recursive object it would need comes from a file in this repository, not from a request.',
    reviewBy: '2027-03-01',
  },
];

// npm audit exits non-zero whenever it finds anything, so the report comes
// back on the error as often as not. The JSON is what matters either way.
function audit() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 << 20,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(audit());

const accepted = new Map(ACCEPTED.map((a) => [a.url, a]));
const today = new Date().toISOString().slice(0, 10);
const unexplained = [];
const expired = [];

for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === 'string' || !via.url) continue;
    const known = accepted.get(via.url);
    if (!known)
      unexplained.push(`${via.severity.padEnd(8)} ${via.name}: ${via.title}\n         ${via.url}`);
    else if (known.reviewBy < today)
      expired.push(
        `${via.name}: accepted until ${known.reviewBy}, which has passed.\n         ${known.why}`,
      );
  }
}

if (unexplained.length) {
  console.error(`\n${unexplained.length} advisory(ies) nobody has looked at:\n`);
  for (const line of new Set(unexplained)) console.error(`  ${line}\n`);
  console.error(
    'Fix them, or add them to ACCEPTED in scripts/audit-check.mjs with the reason and a review date.\n',
  );
  process.exit(1);
}
if (expired.length) {
  console.error('\nAccepted advisories whose review date has passed:\n');
  for (const line of new Set(expired)) console.error(`  ${line}\n`);
  process.exit(1);
}
console.log(
  `No unexplained advisories. ${accepted.size} accepted, each with a reason and a review date.`,
);

// Twenty clerks recording expenses at the same moment must still produce
// consecutive entry numbers, with no gaps and no repeats (docs/plan/10,
// step 10.1; the same promise as Phase 4's test, on real infrastructure).
// Staging only: the entries it makes are real finance entries, which the
// application never deletes. load/README.md says how to check the numbers and
// how to put staging back afterwards.
//
//     k6 run -e BASE_URL=https://api-staging.<domain> \
//       -e EMAIL=<a clerk on staging> -e PASSWORD=… load/numbering.js
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
const CLERKS = Number(__ENV.CLERKS || 20);
const EACH = Number(__ENV.EACH || 20);

if (!BASE_URL || !__ENV.EMAIL || !__ENV.PASSWORD) {
  throw new Error('Set BASE_URL (the API, no /v1), EMAIL and PASSWORD (a clerk).');
}

export const options = {
  scenarios: {
    clerks: { executor: 'per-vu-iterations', vus: CLERKS, iterations: EACH, maxDuration: '10m' },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    entries_recorded: [`count==${CLERKS * EACH}`],
  },
};

const recorded = new Counter('entries_recorded');

const headers = (cookie) => ({
  'content-type': 'application/json',
  'x-irca-client': 'portal',
  ...(cookie ? { cookie } : {}),
});

/** Signs in once and finds an expense item to record against. */
export function setup() {
  const login = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }),
    { headers: headers() },
  );
  if (login.status !== 200) fail(`sign-in answered ${login.status}: ${login.body}`);
  const cookie = Object.entries(login.cookies)
    .map(([name, values]) => `${name}=${values[0].value}`)
    .join('; ');

  // Active items only, which is what the list gives by default.
  const items = http.get(`${BASE_URL}/v1/finance/expense-items`, { headers: headers(cookie) });
  const item = (items.json('rows') || [])[0];
  if (!item) fail('No expense item to record against: create one in Finance first.');

  // Written on every entry, so the run's entries can be found afterwards.
  const run = `load-test ${new Date().toISOString()}`;
  console.log(`Entries are marked "${run}".`);
  return { cookie, itemId: item.id, run };
}

export default function (data) {
  const res = http.post(
    `${BASE_URL}/v1/finance/transactions`,
    JSON.stringify({
      kind: 'EXPENSE',
      expenseItemId: data.itemId,
      clientRequestId: uuid4(),
      txnDate: new Date().toISOString().slice(0, 10),
      amount: '1000',
      method: 'CASH',
      notes: data.run,
    }),
    { headers: headers(data.cookie), tags: { name: 'record' } },
  );
  if (check(res, { 'the entry is recorded': (r) => r.status === 201 })) recorded.add(1);
  else console.error(`record answered ${res.status}: ${res.body}`);

  // Every clerk presses Save together, round after round. The pause keeps one
  // account under its limit of 300 requests a minute.
  sleep(4.5);
}

function uuid4() {
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

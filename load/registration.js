// A Sunday morning, simulated: visitors filling in the registration form at
// the same time (docs/plan/10, step 10.1). Run it against staging, never
// production; load/README.md says how, and how to clear up afterwards.
//
//     k6 run -e BASE_URL=https://api-staging.<domain> -e REGISTRATION_KEY=irk_… \
//       load/registration.js
//
// It calls the API the way the registration form does after its cutover
// (apps/registration/src/lib/registration-api.ts): the form's server holds the
// key and forwards each visitor's address, because the API's limits are per
// visitor. Here each visitor gets an address of their own for the same reason;
// without one, two hundred visitors would share one limit and the test would
// measure the limiter, not the form.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
const KEY = __ENV.REGISTRATION_KEY || '';
const VISITORS = Number(__ENV.VISITORS || 200);
const MINUTES = Number(__ENV.MINUTES || 10);
/** Seconds a visitor spends reading and typing on each screen; 0 for a quick trial. */
const THINK = Number(__ENV.THINK ?? 8);

if (!BASE_URL || !KEY) {
  throw new Error('Set BASE_URL (the API, no /v1) and REGISTRATION_KEY (Dev → Settings).');
}

export const options = {
  scenarios: {
    sunday: {
      // Visitors arrive steadily over the morning, however long each one takes.
      executor: 'constant-arrival-rate',
      rate: VISITORS,
      timeUnit: `${MINUTES}m`,
      duration: `${MINUTES}m`,
      preAllocatedVUs: Math.min(VISITORS, 50),
      maxVUs: VISITORS,
    },
  },
  thresholds: {
    // The target in the plan: a step saves in under 400 ms for 95 in 100.
    'http_req_duration{name:save}': ['p(95)<400'],
    // And nothing fails: not a request, not a step the API turned down.
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    registrations_submitted: [`count==${VISITORS}`],
  },
};

const submitted = new Counter('registrations_submitted');

/** Each visitor: an address, a name and a number of their own. */
function visitor() {
  const n = (__VU * 100_000 + __ITER) % 10_000_000;
  const rand = () => Math.floor(Math.random() * 250) + 1;
  return {
    ip: `10.${rand()}.${rand()}.${rand()}`,
    name: `Load Test ${__VU}-${__ITER}`,
    // 078…: numbers the dice would take a long time to repeat between runs.
    phone: `78${String((n + Math.floor(Math.random() * 10_000_000)) % 10_000_000).padStart(7, '0')}`,
  };
}

function api(who, method, path, body, name) {
  const res = http.request(
    method,
    `${BASE_URL}/v1/public/registrations${path}`,
    body === undefined ? null : JSON.stringify(body),
    {
      headers: {
        authorization: `Bearer ${KEY}`,
        'x-irca-client': 'registration',
        'x-forwarded-for': who.ip,
        'content-type': 'application/json',
      },
      tags: { name },
    },
  );
  return res;
}

/** Someone reading a screen and typing their answers, a little each time. */
function think() {
  if (THINK > 0) sleep(THINK * (0.5 + Math.random()));
}

export default function () {
  const who = visitor();

  const started = api(who, 'POST', '', { lang: 'sw' }, 'start');
  if (!check(started, { 'a registration is started': (r) => r.status === 201 })) {
    fail(`start answered ${started.status}: ${started.body}`);
  }
  const token = started.json('token');

  // The same four screens the API's own test walks for a visitor from Arusha.
  const walk = [
    [
      'who',
      {
        fullname: who.name,
        gender: 'Female',
        age: '25-34',
        occ: 'Professional',
        dialCc: 'TZ',
        dial: '+255',
        phone: who.phone,
      },
    ],
    ['heard', { heard: ['A friend'], friendName: 'Joyce' }],
    [
      'visit',
      { visit: ['First time visitor'], where: 'arusha', ward: 'Njiro', often: 'Every Sunday' },
    ],
    ['prayer', { liked: 'The singing', wantMore: false, interest: [], prayer: '' }],
  ];

  for (const [step, draft] of walk) {
    // The page loads, then autosaves twice while they type.
    check(api(who, 'GET', `/${token}`, undefined, 'page'), {
      'the page loads': (r) => r.status === 200,
    });
    think();
    for (let i = 0; i < 2; i++) {
      check(api(who, 'POST', `/${token}/draft`, { stepId: step, values: draft }, 'draft'), {
        'a draft is kept': (r) => r.status === 204,
      });
    }
    const saved = api(who, 'POST', `/${token}/steps/${step}`, { draft }, 'save');
    const ok = check(saved, {
      'the step is saved': (r) => r.status === 200 && r.json('ok') === true,
    });
    if (!ok) fail(`${step} answered ${saved.status}: ${saved.body}`);
  }

  // The last screen sends the form in; reading it back says so.
  const done = api(who, 'GET', `/${token}`, undefined, 'page');
  if (check(done, { 'the form is sent in': (r) => r.json('status') === 'submitted' })) {
    submitted.add(1);
  }
}

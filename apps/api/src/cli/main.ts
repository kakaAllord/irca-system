// Operational commands, run on the API host rather than through the portal.
//
//   development:  npm run cli -w @irca/api -- <command> [options]   (builds first)
//   production:   node apps/api/dist/cli/main.js <command> [options]
//
// It runs from the compiled build, never through tsx: Nest's dependency
// injection needs the decorator metadata that tsc emits and esbuild does not.
// The runbooks in docs/runbooks say when to reach for each one.
//
// Setting up:
//   church:setup --code IRCA --name "<church name>" [--timezone <tz>] [--currency TZS]
//       Writes the church's one row of settings into a fresh database. Once
//       only; after that the settings are changed in the dev console.
//
//   user:create-dev --email <email> --name "<full name>"
//       Creates the account, or takes over an existing one, sets its password
//       (asked for twice, never echoed) and gives it the Developer and
//       Church administrator roles, which is how the first person gets in.
//
//   registry:sync
//       Writes the permissions and built-in roles the code defines into the
//       database. The API does this at every boot; this is for a fresh
//       database that must be seeded before the API has ever run.
//
// When something has gone wrong:
//   user:send-reset --email <email>
//       Queues the same reset email "Forgot password" sends. The API sends it.
//
//   role:grant --email <email> --role <built-in role key, e.g. admin.administrator>
//       The last resort for a church with no administrator who can sign in.
//
//   sessions:revoke --email <email>
//       Signs someone out of every browser now. Pair it with disabling them.
//
// The registration form's keys:
//   api-client:create --name "<what it is>" [--kind REGISTRATION]
//       Makes a key the registration form uses to call the API. The key is
//       printed once and never stored, only its hash.
//
//   api-client:list
//   api-client:revoke --id <uuid>
//       A revoked key stops working at once; the row stays, so the log of
//       which key did what still reads.
//
// Data:
//   registrations:import --from <old database url> [--dry-run]
//       Copies the live registrations into this database, keeping tokens and
//       timestamps exactly. Re-runnable: it brings across only what changed.
//
//   registrations:export-back --to <old database url> --since <iso time>
//       The other direction, for rolling a cutover back.
//
//   person:erase --person <uuid> [--dry-run]
//       For an erasure request under the Personal Data Protection Act. Erases
//       the person, their registration and answers, notes, journey, class
//       records; keeps the activity log's lines with the name replaced by
//       "[erased]". Asks for the id back before it does anything, and cannot
//       be undone.
//
//   job:run <usage-snapshot | db-sample>
//       Runs a scheduled job now, recorded like any other run.
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { normalizeEmail } from '@irca/shared';
import { CliModule } from './cli.module.js';
import { PrismaDb } from '../core/database/prisma-clients.js';
import { PasswordService } from '../core/auth/password.service.js';
import { AppConfig } from '../config/app-config.js';
import { RegistrySync } from '../core/rbac/registry-sync.service.js';
import { ApiClientService } from '../core/clients/api-client.service.js';
import { JobRunner } from '../core/jobs/job-runner.service.js';
import { UsageService } from '../core/usage/usage.service.js';
import { UsageSnapshot } from '../core/usage/usage-snapshot.service.js';
import { exportRegistrationsBack, importRegistrations } from './commands/registrations-import.js';
import { erasePerson, reportErasure } from './commands/person-erase.js';
import {
  DEV_ROLE_KEYS,
  checkResettable,
  grantRole,
  revokeSessions,
  setupChurch,
} from './commands/access.js';
import { SessionService } from '../core/auth/session.service.js';
import { PasswordResetService } from '../core/auth/password-reset.service.js';
import { promptHidden, promptLine } from './prompt.js';

/* eslint-disable no-console -- a command-line tool reports to its terminal */

const PROBLEM_TEXT = {
  too_short: 'is shorter than 10 characters',
  too_long: 'is longer than 128 characters',
  too_common: 'is in lists of breached passwords',
} as const;

async function createDev(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  if (!values.email || !values.name)
    throw new Error('Usage: user:create-dev --email <email> --name "<full name>"');
  const email = normalizeEmail(values.email);

  await withApp(async (app) => {
    const passwords = app.get(PasswordService);
    const db = app.get(PrismaDb);
    if (!(await db.church.findUnique({ where: { id: 1 } }))) {
      throw new Error('Set the church up first: church:setup --code <CODE> --name "<name>".');
    }

    const password = await promptHidden('Password: ');
    const problem = passwords.check(password);
    if (problem) throw new Error(`That password ${PROBLEM_TEXT[problem]}.`);
    if ((await promptHidden('Repeat it: ')) !== password)
      throw new Error('The two passwords differ.');

    const passwordHash = await passwords.hash(password);
    const now = new Date();
    const user = await db.user.upsert({
      where: { email },
      update: { status: 'ACTIVE', passwordHash, passwordChangedAt: now },
      create: {
        email,
        fullName: values.name!,
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
      },
    });
    // The roles come from the code; on a database the API has never booted
    // against, they are not written yet.
    await app.get(RegistrySync).sync();
    for (const roleKey of DEV_ROLE_KEYS) await grantRole({ db, email, roleKey });
    console.log(`${user.email} is a developer and an administrator, and can sign in.`);
  });
}

async function syncRegistry() {
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    await app.get(RegistrySync).sync();
    console.log('permissions and built-in roles are up to date');
  } finally {
    await app.close();
  }
}

/** Runs a command inside a Nest context, and always closes it. */
async function withApp<T>(
  fn: (app: Awaited<ReturnType<typeof context>>) => Promise<T>,
): Promise<T> {
  const app = await context();
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

const context = () =>
  NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });

async function createApiClient(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      kind: { type: 'string', default: 'REGISTRATION' },
      name: { type: 'string' },
    },
  });
  if (!values.name) {
    throw new Error('Usage: api-client:create --name "<what it is>"');
  }
  if (values.kind !== 'REGISTRATION') throw new Error('The only kind today is REGISTRATION.');

  await withApp(async (app) => {
    const db = app.get(PrismaDb);
    const church = await db.church.findFirstOrThrow();

    const { key, client } = await app.get(ApiClientService).create({
      kind: 'REGISTRATION',
      name: values.name!,
    });
    console.log(`${client.name} for ${church.code}:`);
    console.log('');
    console.log(`  ${key}`);
    console.log('');
    console.log('This is the only time it is shown. Put it in the app as REGISTRATION_API_KEY.');
  });
}

async function listApiClients(args: string[]) {
  parseArgs({ args, options: {} });
  await withApp(async (app) => {
    const clients = await app.get(ApiClientService).list();
    if (!clients.length) return console.log('No keys.');
    for (const client of clients) {
      const state = client.revokedAt
        ? 'revoked'
        : (client.lastUsedAt?.toISOString() ?? 'never used');
      console.log(`${client.id}  ${client.keyPrefix}…  ${client.kind}  ${client.name}  (${state})`);
    }
  });
}

async function revokeApiClient(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: 'string' } } });
  if (!values.id) throw new Error('Usage: api-client:revoke --id <uuid>');
  await withApp(async (app) => {
    const done = await app.get(ApiClientService).revoke(values.id!);
    console.log(done ? 'That key no longer works.' : 'No live key with that id.');
  });
}

async function importRegistrationsCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      from: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.from) {
    throw new Error('Usage: registrations:import --from <url> [--dry-run]');
  }
  await withApp((app) =>
    importRegistrations({
      from: values.from!,
      dryRun: values['dry-run'] ?? false,
      db: app.get(PrismaDb),
    }),
  );
}

async function exportRegistrationsCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { to: { type: 'string' }, since: { type: 'string' } },
  });
  if (!values.to || !values.since) {
    throw new Error('Usage: registrations:export-back --to <url> --since <iso time>');
  }
  await withApp((app) =>
    exportRegistrationsBack({
      to: values.to!,
      since: values.since!,
      db: app.get(PrismaDb),
    }),
  );
}

async function runJob(args: string[]) {
  const [name] = args;
  await withApp(async (app) => {
    const snapshot = app.get(UsageSnapshot);
    const jobs: Record<string, () => Promise<Record<string, unknown>>> = {
      'usage-snapshot': () => snapshot.run(),
      'db-sample': () => snapshot.sampleConnections(),
    };
    const job = name ? jobs[name] : undefined;
    if (!job) throw new Error(`Jobs: ${Object.keys(jobs).join(', ')}`);
    await app.get(JobRunner).run(name!, job);
    await app.get(UsageService).flush();
    console.log(`${name} ran; see job_runs for how it went.`);
  });
}

async function erasePersonCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      person: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.person) {
    throw new Error('Usage: person:erase --person <uuid> [--dry-run]');
  }
  const dryRun = values['dry-run'] ?? false;

  await withApp(async (app) => {
    const result = await erasePerson({
      personId: values.person!,
      dryRun,
      db: app.get(PrismaDb),
      ownerUrl: app.get(AppConfig).get('DIRECT_DATABASE_URL'),
      // Typing the id back is the whole safety catch: it cannot be answered
      // by holding down y, and it proves the right record is in front of them.
      confirm: async (person) => {
        console.log('');
        console.log(`About to erase ${person.fullName || '(no name)'} — ${person.phone}`);
        console.log('Everything about them goes, and it cannot be undone.');
        return promptLine('Type their id to confirm: ');
      },
    });
    reportErasure(result, dryRun);
  });
}

async function setupChurchCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      code: { type: 'string' },
      name: { type: 'string' },
      timezone: { type: 'string' },
      currency: { type: 'string' },
    },
  });
  if (!values.code || !values.name) {
    throw new Error(
      'Usage: church:setup --code IRCA --name "<church name>" [--timezone <tz>] [--currency TZS]',
    );
  }
  await withApp(async (app) => {
    const church = await setupChurch({
      db: app.get(PrismaDb),
      code: values.code!,
      name: values.name!,
      timezone: values.timezone,
      currency: values.currency,
    });
    console.log(
      `${church.name} (${church.code}) is set up, on ${church.timezone} time in ${church.currency}.`,
    );
    console.log('Next: user:create-dev for yourself, then sign in and invite the church.');
  });
}

async function sendResetCommand(args: string[]) {
  const { values } = parseArgs({ args, options: { email: { type: 'string' } } });
  if (!values.email) throw new Error('Usage: user:send-reset --email <email>');
  await withApp(async (app) => {
    const user = await checkResettable(app.get(PrismaDb), values.email!);
    await app.get(PasswordResetService).request(user.email);
    console.log(`A reset link for ${user.email} is queued. The API sends it within a minute;`);
    console.log('it works once, for one hour.');
  });
}

async function grantRoleCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { email: { type: 'string' }, role: { type: 'string' } },
  });
  if (!values.email || !values.role) {
    throw new Error(
      'Usage: role:grant --email <email> --role <role key, e.g. admin.administrator>',
    );
  }
  await withApp(async (app) => {
    const { user, role, granted } = await grantRole({
      db: app.get(PrismaDb),
      email: values.email!,
      roleKey: values.role!,
    });
    console.log(
      granted
        ? `${user.fullName} now has the ${role.name} role. It is in the church's activity log.`
        : `${user.fullName} already had the ${role.name} role. Nothing changed.`,
    );
  });
}

async function revokeSessionsCommand(args: string[]) {
  const { values } = parseArgs({ args, options: { email: { type: 'string' } } });
  if (!values.email) throw new Error('Usage: sessions:revoke --email <email>');
  await withApp(async (app) => {
    const { user, open } = await revokeSessions({
      db: app.get(PrismaDb),
      sessions: app.get(SessionService),
      email: values.email!,
    });
    console.log(`${user.email} is signed out of ${open} browser${open === 1 ? '' : 's'}.`);
    if (user.status === 'ACTIVE') {
      console.log('Their password still works: disable them in the portal, or send a reset.');
    }
  });
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  'church:setup': setupChurchCommand,
  'user:send-reset': sendResetCommand,
  'role:grant': grantRoleCommand,
  'sessions:revoke': revokeSessionsCommand,
  'job:run': runJob,
  'user:create-dev': createDev,
  'registry:sync': syncRegistry,
  'api-client:create': createApiClient,
  'api-client:list': listApiClients,
  'api-client:revoke': revokeApiClient,
  'registrations:import': importRegistrationsCommand,
  'registrations:export-back': exportRegistrationsCommand,
  'person:erase': erasePersonCommand,
};

const [command, ...rest] = process.argv.slice(2);
const run = command ? COMMANDS[command] : undefined;
if (!run) {
  console.error(`Commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}
try {
  await run(rest);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

// Operational commands, run on the API host rather than through the portal.
//
//   development:  npm run cli -w @irca/api -- <command> [options]   (builds first)
//   production:   node apps/api/dist/cli/main.js <command> [options]
//
// It runs from the compiled build, never through tsx: Nest's dependency
// injection needs the decorator metadata that tsc emits and esbuild does not.
//
// Commands:
//   user:create-dev --email <email> --name "<full name>"
//       Creates the account, or promotes an existing one, to the platform dev
//       role, and sets its password (asked for twice, never echoed). The only
//       way anyone becomes a dev: no endpoint can grant it.
//
//   registry:sync
//       Writes the permissions and built-in roles the code defines into the
//       database. The API does this at every boot; this is for a fresh
//       database that must be seeded before the API has ever run.
//
//   api-client:create --church <CODE> --kind REGISTRATION --name "<what it is>"
//       Makes a key a church's own app uses to call the API. The key is
//       printed once and never stored, only its hash.
//
//   registrations:import --from <old database url> --church <CODE> [--dry-run]
//       Copies the live registrations into this database, keeping tokens and
//       timestamps exactly. Re-runnable: it brings across only what changed.
//
//   registrations:export-back --to <old database url> --church <CODE> --since <iso time>
//       The other direction, for rolling a cutover back.
//
//   job:run <usage-snapshot | db-sample>
//       Runs a scheduled job now, recorded like any other run.
//
//   person:erase --church <CODE> --person <uuid> [--dry-run]
//       For an erasure request under the Personal Data Protection Act. Erases
//       the person, their registration and answers, notes, journey, class
//       records; keeps the activity log's lines with the name replaced by
//       "[erased]". Asks for the id back before it does anything, and cannot
//       be undone.
//
//   api-client:list [--church <CODE>]
//   api-client:revoke --id <uuid>
//       A revoked key stops working at once; the row stays, so the log of
//       which key did what still reads.
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

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const passwords = app.get(PasswordService);
    const db = app.get(PrismaDb);

    const password = await promptHidden('Password: ');
    const problem = passwords.check(password);
    if (problem) throw new Error(`That password ${PROBLEM_TEXT[problem]}.`);
    if ((await promptHidden('Repeat it: ')) !== password)
      throw new Error('The two passwords differ.');

    const passwordHash = await passwords.hash(password);
    const now = new Date();
    const user = await db.user.upsert({
      where: { email },
      update: { platformRole: 'DEV', status: 'ACTIVE', passwordHash, passwordChangedAt: now },
      create: {
        email,
        fullName: values.name,
        platformRole: 'DEV',
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: now,
      },
    });
    console.log(`${user.email} is a dev and can sign in.`);
  } finally {
    await app.close();
  }
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
      church: { type: 'string' },
      kind: { type: 'string', default: 'REGISTRATION' },
      name: { type: 'string' },
    },
  });
  if (!values.church || !values.name) {
    throw new Error('Usage: api-client:create --church <CODE> --name "<what it is>"');
  }
  if (values.kind !== 'REGISTRATION') throw new Error('The only kind today is REGISTRATION.');

  await withApp(async (app) => {
    const db = app.get(PrismaDb);
    const church = await db.church.findUnique({ where: { code: values.church!.toUpperCase() } });
    if (!church) throw new Error(`No church with the code ${values.church}.`);

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
  const { values } = parseArgs({ args, options: { church: { type: 'string' } } });
  await withApp(async (app) => {
    const db = app.get(PrismaDb);
    const church = values.church
      ? await db.church.findUnique({ where: { code: values.church.toUpperCase() } })
      : null;
    if (values.church && !church) throw new Error(`No church with the code ${values.church}.`);

    const clients = await app.get(ApiClientService).list(church?.id);
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
      church: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.from || !values.church) {
    throw new Error('Usage: registrations:import --from <url> --church <CODE> [--dry-run]');
  }
  await withApp((app) =>
    importRegistrations({
      from: values.from!,
      churchCode: values.church!,
      dryRun: values['dry-run'] ?? false,
      db: app.get(PrismaDb),
    }),
  );
}

async function exportRegistrationsCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { to: { type: 'string' }, church: { type: 'string' }, since: { type: 'string' } },
  });
  if (!values.to || !values.church || !values.since) {
    throw new Error(
      'Usage: registrations:export-back --to <url> --church <CODE> --since <iso time>',
    );
  }
  await withApp((app) =>
    exportRegistrationsBack({
      to: values.to!,
      churchCode: values.church!,
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
      church: { type: 'string' },
      person: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.church || !values.person) {
    throw new Error('Usage: person:erase --church <CODE> --person <uuid> [--dry-run]');
  }
  const dryRun = values['dry-run'] ?? false;

  await withApp(async (app) => {
    const result = await erasePerson({
      churchCode: values.church!,
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

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
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

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
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { normalizeEmail } from '@irca/shared';
import { CliModule } from './cli.module.js';
import { PrismaCore } from '../core/database/prisma-clients.js';
import { PasswordService } from '../core/auth/password.service.js';
import { RegistrySync } from '../core/rbac/registry-sync.service.js';
import { promptHidden } from './prompt.js';

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
    const db = app.get(PrismaCore);

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

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  'user:create-dev': createDev,
  'registry:sync': syncRegistry,
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

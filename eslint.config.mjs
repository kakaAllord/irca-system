// One lint setup for every workspace. The registration app predates it and is
// not linted yet: reformatting it now would bury real changes in noise.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/registration/**',
      'apps/api/src/generated/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Use the logger. A stray console.log in the API bypasses redaction.
      'no-console': 'warn',
      // A leading underscore marks a value left unused on purpose, e.g. one
      // destructured out of an object to leave the rest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The portal runs in browsers as well as on the server.
    files: ['apps/portal/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Raw SQL is written with the `sql` tag in core/database/sql.ts, which
    // binds every value as a parameter. The Unsafe pair takes a string, so a
    // query could be built by concatenation — one edit away from an injection
    // in a query that looked fine when it was written.
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^\\$(query|execute)RawUnsafe$/]',
          message:
            'Use the sql tag from core/database/sql.ts with $queryRaw/$executeRaw: every value is then a bound parameter.',
        },
      ],
    },
  },
  {
    // Feature modules reach the database only through Db: one entry point,
    // with tx() for anything that must stand or fall together. The dev
    // console is one of them, since D27; nothing sees more than any other.
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/database/prisma-clients*'],
              message:
                'Inject Db instead. Only core code uses the Prisma clients directly.',
            },
            {
              // Types (models, Prisma.*Input) are fine; a client instance is not.
              group: ['**/generated/prisma/*'],
              allowTypeImports: true,
              message:
                'Import only types from the generated client (import type ...). Use Db for queries.',
            },
          ],
        },
      ],
    },
  },
);

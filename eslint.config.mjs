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
);

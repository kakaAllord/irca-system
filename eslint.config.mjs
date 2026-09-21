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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Use the logger. A stray console.log in the API bypasses redaction.
      'no-console': 'warn',
    },
  },
);

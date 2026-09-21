import { defineConfig } from 'tsup';

// Built to plain JavaScript in both module formats: the NestJS API loads
// CommonJS, the Next.js apps load ES modules, and neither should have to
// compile this package's TypeScript itself.
export default defineConfig((options) => ({
  // Two entry points: the registration flow is a subpath
  // (`@irca/shared/registration`) so the staff portal never pulls in the
  // phone-number library the form needs.
  entry: ['src/index.ts', 'src/registration/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // Never while watching: `npm run dev` starts this watcher and the API's
  // own watcher at the same moment, and emptying dist here leaves the API
  // type-checking against a package that has no types, which fails its first
  // build and leaves it sitting there waiting for a change.
  clean: !options.watch,
  sourcemap: true,
}));

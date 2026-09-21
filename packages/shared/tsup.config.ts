import { defineConfig } from 'tsup';

// Built to plain JavaScript in both module formats: the NestJS API loads
// CommonJS, the Next.js apps load ES modules, and neither should have to
// compile this package's TypeScript itself.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});

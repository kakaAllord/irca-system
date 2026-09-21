import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { metricDef } from '@irca/shared';

/** Every source file of the API, generated code excepted. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'generated') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('usage metrics', () => {
  it('lists every metric the code counts, so the dev console can show it', () => {
    const counted = new Set<string>();
    for (const file of sources('src')) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /usage\.(?:inc|max|gauge)\(\s*['`]([^'`$]+)/g,
      )) {
        counted.add(match[1]!);
      }
    }
    const unlisted = [...counted].filter((key) => !metricDef(key.replace(/\.$/, '.x')));
    expect(counted.size).toBeGreaterThan(20);
    expect(unlisted).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel compiles each api/*.ts standalone WITHOUT bundling relative imports,
// so every `from './...'` in api/ crashes live with ERR_MODULE_NOT_FOUND.
describe('api conventions', () => {
  it('has no sibling imports in api/ (standalone Vercel functions)', () => {
    const apiDir = join(process.cwd(), 'api');
    const files = readdirSync(apiDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(apiDir, file), 'utf8');
      if (content.includes("from './") || content.includes('from "./')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

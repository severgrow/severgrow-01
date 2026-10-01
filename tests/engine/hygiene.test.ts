import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = join(import.meta.dirname, '../../src/engine');
const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'));

describe('engine hygiene (section 2 / acceptance checklist)', () => {
  it.each(files)('%s uses no Math.random, I/O, timers or non-engine imports', (f) => {
    const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/\b(setTimeout|setInterval|Date\.now|new Date|performance\.now)\b/);
    expect(src).not.toMatch(/from ['"](node:|fs|path|http)/);
    expect(src).not.toMatch(/from ['"]\.\.\/(bots|sim|cli)/);
  });
});

// Regression guard for a gap that shipped silently once.
//
// `GET /v1/health` is answered TWICE: `fetch-app.ts` answers it in-process, but the deployed Edge
// entry intercepts the route first (so `?db=1` can report pooler diagnostics without booting the
// app). The entry's responses did not carry `features`, so production never advertised
// `campaign-random-deals` even though `SERVER_FEATURES` listed it and `http.test.ts` passed against
// `fetch-app.ts`. Campaign deals then stayed off for every player while the tests looked green.
//
// The Deno entry cannot be imported under Node, so — like `edge-pool.test.ts` and `edge-cors.test.ts`
// — its source is read as text and `npm run check` catches any drift.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');
const edgeEntry = read('../src/edge-entry.ts');

/** The `/v1/health` branch of the Edge entry, from its route test to the end of the handler. */
const healthBranch = (): string => {
  const start = edgeEntry.indexOf("path === '/v1/health'");
  expect(start).toBeGreaterThan(-1);
  const end = edgeEntry.indexOf('try {', edgeEntry.indexOf('failureResponse(error, cors)'));
  return edgeEntry.slice(start, end);
};

describe('Edge entry health contract', () => {
  it('imports the shared server feature list', () => {
    expect(edgeEntry).toMatch(/import\s*\{[^}]*\bSERVER_FEATURES\b[^}]*\}\s*from\s*'\.\/fetch-app\.js'/);
  });

  it('advertises features on the plain and the database health response', () => {
    const branch = healthBranch();
    const advertised = branch.match(/features:\s*SERVER_FEATURES/g) ?? [];
    // One for `/v1/health`, one for `/v1/health?db=1`: a page reads whichever it asks for.
    expect(advertised).toHaveLength(2);
  });
});

// `npm run replay -- <seed> <action-log.json>`  (the log is an array of actions,
// or an object with { actions, config? })
import { readFileSync } from 'node:fs';
import type { Action, RulesConfig } from '../engine/index.js';
import { replayReport } from './replay.js';

const [seedArg, file] = process.argv.slice(2);
if (!seedArg || !file) {
  console.error('Usage: npm run replay -- <seed> <action-log.json>');
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, 'utf8')) as Action[] | { actions: Action[]; config?: Partial<RulesConfig> };
const actions = Array.isArray(data) ? data : data.actions;
const config = Array.isArray(data) ? {} : (data.config ?? {});
const r = replayReport(Number(seedArg), actions, config);
console.log(r.text);
process.exit(r.ok ? 0 : 1);

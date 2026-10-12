// Tiny Edge entry: loads the MatchService bundle from this public repo (keeps MCP deploys small).
// After changing the API, run `npm run server:build-edge`, commit, push, then redeploy this function.
const BUNDLE_REF = Deno.env.get("BUNDLE_REF") ?? "futa0.5-online";
const url = `https://raw.githubusercontent.com/severgrow/severgrow-01/${BUNDLE_REF}/supabase/functions/duel/bundle.ts`;
await import(url);

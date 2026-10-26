export const CHAT_CSS = `
.match-chat { --chat-ink: #e8ddc5; color: var(--chat-ink); font-family: var(--font-ui, ui-monospace, monospace);
  /* THE CHAT'S OWN GLASS (owner, 2026-10-26: "decrease the blur behind it by 18% so the board is
     still visible"). The shared --dark-glass-blur is 9px and every other surface — the pause plate,
     settings, the match intel window, the replay — is tuned around exactly that. So the weaker
     radius lives HERE, as a chat-scoped property, and the panel reads it. 9px × 0.82 = 7.38, kept at
     one decimal (7.4px); the saturate is untouched, and the tint keeps the shared --dark-glass. */
  --chat-glass-blur: blur(7.4px) saturate(1.05); }
#match-chat-toggle { position:absolute;left:52px;top:2px;width:44px;height:44px;z-index:12;pointer-events:auto;display:grid;place-items:center;color:#e8ddc5; }
/* An extra hardware key above the context slot; absolute placement leaves cockpit layout intact. */
#smart-panel > #match-chat-toggle {left:auto;right:0;top:calc(-1 * (var(--control-size,44px) + var(--control-gap,4px)));width:var(--control-size,44px);height:var(--control-size,44px);min-width:var(--control-size,44px);min-height:var(--control-size,44px);margin:0;padding:0;box-sizing:border-box;border:0;border-radius:12px;background:#111312;color:var(--control-ivory,#f5edda);box-shadow:none;touch-action:manipulation;}
#smart-panel > #match-chat-toggle::before {content:'';position:absolute;inset:0;pointer-events:none;background:url('./hardware/button-frame-supplied.webp') center / contain no-repeat;}
#smart-panel > #match-chat-toggle svg {position:relative;width:21px;height:21px;z-index:1;opacity:.94;}
#smart-panel > #match-chat-toggle:is(:hover,:focus-visible,[aria-expanded='true']) {color:#fff1cf;box-shadow:0 0 9px var(--light-bloom,rgba(196,150,88,.22));}
#smart-panel > #match-chat-toggle:focus-visible {outline:none;}
#smart-panel > .match-chat-preview {position:absolute;top:auto;left:auto;right:0;bottom:calc(100% + var(--control-size,44px) + var(--control-gap,4px) + 8px);color:#e8ddc5;box-sizing:border-box;}
#match-chat-toggle[aria-expanded='true']{visibility:hidden;pointer-events:none;}
#match-chat-toggle svg {width:19px;height:19px;stroke:currentColor;stroke-width:1.5;fill:none;}
/* MUTED IN THE COCKPIT (owner, 2026-10-26): the key is dimmed AND carries a slash through the
   speech glyph, so the state is a mark, not colour alone. Its accessible name says it too. */
#match-chat-toggle[data-muted='true'] svg {opacity:.45;}
#match-chat-toggle[data-muted='true']::after {content:'';position:absolute;left:calc(50% - 11px);top:calc(50% - 1px);width:22px;height:2px;border-radius:2px;background:currentColor;transform:rotate(-45deg);box-shadow:0 0 0 2px #111312;pointer-events:none;}
.match-chat-dot {position:absolute;right:5px;top:6px;width:6px;height:6px;border-radius:50%;background:#e8ddc5;box-shadow:0 0 0 3px rgba(8,10,10,.5);}
.match-chat-panel {position:fixed;z-index:65;top:var(--chat-top,56px);left:max(8px,env(safe-area-inset-left));width:min(480px,calc(100vw - 16px - env(safe-area-inset-right) - env(safe-area-inset-left)));height:min(680px,var(--chat-height,calc(100dvh - 72px)));box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:var(--dark-glass,rgba(8,10,10,.42));-webkit-backdrop-filter:var(--chat-glass-blur,blur(7.4px) saturate(1.05));backdrop-filter:var(--chat-glass-blur,blur(7.4px) saturate(1.05));border:0;border-radius:12px;box-shadow:0 12px 36px #0004;transform-origin:bottom right;}
.match-chat[data-desktop-docked='true'] .match-chat-panel{left:var(--chat-left);width:var(--chat-width);height:var(--chat-height);}
.match-chat-panel[hidden], .match-chat [hidden], #match-chat-toggle[hidden] {display:none!important;}
.match-chat-head {display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 8px 2px 16px;flex:none;border-bottom:1px solid #e8ddc51a;background:#080a0a38;}
.match-chat-opponent-name{display:flex;align-items:center;gap:6px;font-size:10px;color:#e8ddc58c;max-width:180px;overflow-wrap:anywhere;margin-top:3px;}
.match-chat-presence{flex:none;width:5px;height:5px;border-radius:50%;background:#a39e91;}
.match-chat-presence[data-presence='online']{background:#8fbf6a;}
.match-chat-presence[data-presence='away']{background:#d47a69;}
.match-chat-head-keys{display:flex;flex:none;}
.match-chat-head h2 {font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0;}
.match-chat button {font:inherit;color:inherit;border:1px solid #e8ddc529;background:transparent;border-radius:7px;min-height:44px;padding:6px 10px;cursor:pointer;touch-action:manipulation;}
.match-chat button:hover {background:#e8ddc50c;}
.match-chat button:active {transform:translateY(1px);background:#e8ddc51a;}
.match-chat button:focus-visible,.match-chat input:focus-visible,.match-chat select:focus-visible {outline:2px solid #e8ddc5;outline-offset:-3px;}
.match-chat button:disabled {opacity:.36;cursor:default;transform:none;}
.match-chat-head button:focus-visible{outline:none;color:#fff1cf;filter:drop-shadow(0 0 4px #e8ddc570);}
.match-chat-head button {width:44px;padding:0;border:0;font-size:20px;display:grid;place-items:center;}
.match-chat-head button svg{width:18px;height:18px;}
.match-chat-log {flex:1;min-height:36px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:6px 18px;overflow-anchor:none;}
.match-chat-line {display:flow-root;padding:12px 0;border-bottom:1px solid #e8ddc50b;overflow-wrap:anywhere;}
.match-chat-line[data-grouped='true']{padding-top:4px;}
.match-chat-line[data-continues='true']{border-bottom:0;padding-bottom:3px;}
.match-chat-unread{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#b8c8ad;display:flex;align-items:center;gap:10px;margin:14px 0 6px;}
.match-chat-unread::before,.match-chat-unread::after{content:'';height:1px;flex:1;background:#b8c8ad38;}
.match-chat-meta {display:flex;align-items:center;gap:8px;color:#e8ddc58c;font-size:11px;letter-spacing:.07em;text-transform:uppercase;}
.match-chat-line[data-mine='true'] .match-chat-speaker {color:#abc3a6;}
.match-chat-line[data-mine='false'] .match-chat-speaker {color:#d4a18c;}
.match-chat-time {margin-left:auto;letter-spacing:0;}
.match-chat-text {font-family:var(--font);font-size:14px;line-height:1.5;margin:4px 0 0;white-space:pre-wrap;}
.match-chat-message-actions {position:relative;float:right;margin:-4px -10px -4px 4px;}
.match-chat-message-actions > summary {display:grid;place-items:center;list-style:none;width:44px;min-height:44px;cursor:pointer;font-size:20px;color:#e8ddc58c;touch-action:manipulation;border-radius:7px;}
.match-chat-message-actions > summary::-webkit-details-marker{display:none;}
.match-chat-message-actions > summary:focus-visible{outline:2px solid #e8ddc5;outline-offset:-3px;}
.match-chat-message-actions[open] > summary{background:#e8ddc50c;}
.match-chat-message-actions .match-chat-report {position:absolute;right:0;top:40px;z-index:3;white-space:nowrap;font-size:11px;min-height:44px;background:#151915;border:1px solid #e8ddc529;box-shadow:0 6px 16px #0005;}
.match-chat-message-actions:not([open]) > button{display:none;}

.match-chat-empty {color:#e8ddc58c;font-size:17px;line-height:1.6;padding:12px 0;}
.match-chat-foot {position:relative;flex:none;border-top:1px solid #e8ddc51a;padding:6px 10px max(10px,env(safe-area-inset-bottom));background:#080a0a45;}
.match-chat-status {font-size:11px;line-height:1.5;letter-spacing:.035em;color:#e8ddc5b3;}
.match-chat-form {display:flex;gap:6px;}
/* 17px, NOT 16px (owner, 2026-10-26 on an iPhone 17: the chat "zooms in awkwardly when entering
   text box" and the zoom hid the close key). iOS zooms the page when a focused field computes under
   16px; 16px sits exactly ON that threshold, and the shipped composer was 16px — so the margin here
   is deliberate, not a typographic whim. One extra pixel is invisible and removes the boundary case
   for every iPhone. The app-wide floor lives in src/style.css. */
.match-chat input {min-width:0;flex:1;border:1px solid #e8ddc529;border-radius:7px;background:#080a0a40;color:#e8ddc5;font-family:var(--font);font-size:17px;min-height:44px;box-sizing:border-box;padding:8px 10px;}
.match-chat input:disabled {opacity:.45;}
.match-chat input::placeholder {color:#e8ddc580;}
.match-chat-send {font-size:13px!important;border:0!important;background:transparent!important;position:relative;isolation:isolate;}
.match-chat-send::before{content:'';position:absolute;inset:6px 0;background:#728b6826;border:1px solid #a8bf9226;border-radius:6px;z-index:-1;}
.match-chat-phrase-toggle{position:relative;flex:none;width:44px;padding:0!important;border:0!important;display:grid;place-items:center;}
.match-chat-phrase-toggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;}
.match-chat-phrase-toggle[aria-expanded='true']{color:#b8c8ad;background:#728b681a;}
.match-chat-phrases {position:absolute;right:12px;bottom:calc(100% + 8px);display:flex;flex-direction:column;gap:2px;width:min(240px,calc(100% - 24px));padding:6px;box-sizing:border-box;max-height:max(56px,calc(var(--chat-height,500px) - 164px));overflow:auto;overscroll-behavior:contain;background:rgba(12,15,14,.94);backdrop-filter:var(--dark-glass-blur);border:1px solid #e8ddc52b;border-radius:9px;box-shadow:0 8px 24px #0005;z-index:2;}

.match-chat-phrases button {font-size:15px;text-align:left;border:0;padding:6px 12px;}
/* The report reason window (owner, 2026-10-26): the ··· drawer that used to hold it is gone, so it
   opens as a band directly under the chat header. A full-width reason, then the two decisions. */
.match-chat-report-form {display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px;flex:none;border-bottom:1px solid #e8ddc51a;background:#080a0a5c;}
.match-chat-report-form select {grid-column:1/-1;min-width:0;color:#e8ddc5;background:#17181a;border:1px solid #e8ddc529;border-radius:7px;min-height:44px;font-size:16px;}
.match-chat-report-form button {font-size:11px;padding-inline:6px;white-space:nowrap;}
/* The opponent's mute: one quiet factual line, never a reason or a time. */
.match-chat-note {flex:none;margin:0;padding:6px 18px;border-bottom:1px solid #e8ddc514;color:#b7a98a;font-size:11px;letter-spacing:.03em;}
.match-chat-status-row {display:flex;align-items:center;gap:8px;margin:0 0 7px;}
.match-chat-status {flex:1;margin:0;}
/* Block stays reachable without a menu: a quiet word beside the status, only once the opponent has
   written something. It keeps the shared 44px touch target. */
.match-chat-block {flex:0 0 auto;font-size:10px!important;color:#e8ddc5a6;padding:6px 10px!important;}
.match-chat-preview {position:fixed;z-index:30;left:calc(54px + env(safe-area-inset-left));top:52px;max-width:min(240px,calc(100vw - 24px));padding:8px 11px;background:var(--dark-glass);backdrop-filter:var(--dark-glass-blur);border:1px solid #e8ddc51a;border-radius:8px;font:12px/1.4 var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;}
.match-chat-newer {position:absolute;top:55px;left:50%;transform:translateX(-50%);background:#171b18!important;font-size:10px!important;box-shadow:0 3px 15px #0004;}
.match-chat-outgoing {font-size:11px;line-height:1.5;padding:6px 0;color:#e8ddc5a6;}
.match-chat-outgoing button {min-height:44px;font-size:10px;margin-left:6px;}
body.paused .match-chat,body.result .match-chat,body.paused #match-chat-toggle {visibility:hidden;}


@media(max-height:450px) {.match-chat-panel{width:min(480px,calc(100vw - 16px));height:var(--chat-height,calc(100dvh - 60px));}.match-chat-phrases{margin-top:2px}.match-chat-line{padding:12px 0}.match-chat-foot{padding:5px 8px;}}
@media(max-width:600px) {.match-chat-panel{width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));height:var(--chat-height,calc(100dvh - 64px));}.match-chat-head{padding-left:18px;}.match-chat-text{font-size:14px;}.match-chat-log{padding-inline:18px;}}
@media(prefers-reduced-motion:reduce) {.match-chat button:active{transform:none}}
.reduce-motion .match-chat button:active{transform:none;}
`;

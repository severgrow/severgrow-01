export const CHAT_CSS = `
.match-chat { --chat-ink: #e8ddc5; color: var(--chat-ink); font-family: var(--font-ui, ui-monospace, monospace); }
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
.match-chat-dot {position:absolute;right:5px;top:6px;width:6px;height:6px;border-radius:50%;background:#e8ddc5;box-shadow:0 0 0 3px rgba(8,10,10,.5);}
.match-chat-panel {position:fixed;z-index:65;top:var(--chat-top,56px);left:max(8px,env(safe-area-inset-left));width:min(480px,calc(100vw - 16px - env(safe-area-inset-right) - env(safe-area-inset-left)));height:min(680px,var(--chat-height,calc(100dvh - 72px)));box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:var(--dark-glass,rgba(8,10,10,.42));-webkit-backdrop-filter:var(--dark-glass-blur,blur(9px) saturate(1.05));backdrop-filter:var(--dark-glass-blur,blur(9px) saturate(1.05));border:0;border-radius:12px;box-shadow:0 12px 36px #0004;transform-origin:bottom right;}
.match-chat[data-desktop-docked='true'] .match-chat-panel{left:var(--chat-left);width:var(--chat-width);height:var(--chat-height);}
.match-chat-panel[hidden], .match-chat [hidden], #match-chat-toggle[hidden] {display:none!important;}
.match-chat-head {display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 8px 2px 16px;flex:none;border-bottom:1px solid #e8ddc51a;background:#080a0a38;}
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
.match-chat-line {padding:12px 0;border-bottom:1px solid #e8ddc50b;overflow-wrap:anywhere;}
.match-chat-meta {display:flex;align-items:center;gap:8px;color:#e8ddc58c;font-size:11px;letter-spacing:.07em;text-transform:uppercase;}
.match-chat-line[data-mine='true'] .match-chat-speaker {color:#abc3a6;}
.match-chat-line[data-mine='false'] .match-chat-speaker {color:#d4a18c;}
.match-chat-time {margin-left:auto;letter-spacing:0;}
.match-chat-text {font-family:var(--font);font-size:14px;line-height:1.5;margin:4px 0 0;white-space:pre-wrap;}
.match-chat-report {font-size:10px!important;min-height:44px!important;float:right;margin:0 -6px -4px 6px;padding:4px 8px!important;border:0!important;color:#e8ddc58c!important;}
.match-chat-empty {color:#e8ddc58c;font-size:17px;line-height:1.6;padding:12px 0;}
.match-chat-foot {position:relative;flex:none;border-top:1px solid #e8ddc51a;padding:6px 10px max(10px,env(safe-area-inset-bottom));background:#080a0a45;}
.match-chat-status {font-size:11px;line-height:1.5;letter-spacing:.035em;color:#e8ddc5b3;margin:0 2px 7px;}
.match-chat-form {display:flex;gap:6px;}
.match-chat input {min-width:0;flex:1;border:1px solid #e8ddc529;border-radius:7px;background:#080a0a40;color:#e8ddc5;font-family:var(--font);font-size:16px;min-height:44px;box-sizing:border-box;padding:8px 10px;}
.match-chat input:disabled {opacity:.45;}
.match-chat input::placeholder {color:#e8ddc580;}
.match-chat-send {font-size:13px!important;border:0!important;background:transparent!important;position:relative;isolation:isolate;}
.match-chat-send::before{content:'';position:absolute;inset:6px 0;background:#728b6826;border:1px solid #a8bf9226;border-radius:6px;z-index:-1;}
.match-chat-phrase-toggle{position:relative;flex:none;width:36px;padding:0!important;border:0!important;display:grid;place-items:center;}
.match-chat-phrase-toggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;}
.match-chat-phrase-toggle[aria-expanded='true']{color:#b8c8ad;background:#728b681a;}
.match-chat-phrases {position:absolute;right:12px;bottom:calc(100% + 8px);display:flex;flex-direction:column;gap:2px;width:min(240px,calc(100% - 24px));padding:6px;box-sizing:border-box;max-height:max(56px,calc(var(--chat-height,500px) - 164px));overflow:auto;overscroll-behavior:contain;background:rgba(12,15,14,.94);backdrop-filter:var(--dark-glass-blur);border:1px solid #e8ddc52b;border-radius:9px;box-shadow:0 8px 24px #0005;z-index:2;}

.match-chat-phrases button {font-size:15px;text-align:left;border:0;padding:6px 12px;}
.match-chat-controls {border-top:1px solid #e8ddc514;padding:0 10px;flex:none;max-height:40%;overflow:auto;}
.match-chat-controls:not([open]){display:none;}
.match-chat-controls summary {display:none!important;cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:10px;color:#e8ddc58c;}
.match-chat-tools {display:flex;gap:5px;flex-wrap:wrap;padding-block:8px;}
.match-chat-tools button,.match-chat-tools select {font-size:11px;flex:1;}
.match-chat-tools select {min-width:90px;color:#e8ddc5;background:#17181a;border:1px solid #e8ddc529;border-radius:7px;min-height:44px;}
.match-chat-preview {position:fixed;z-index:30;left:calc(54px + env(safe-area-inset-left));top:52px;max-width:min(240px,calc(100vw - 24px));padding:8px 11px;background:var(--dark-glass);backdrop-filter:var(--dark-glass-blur);border:1px solid #e8ddc51a;border-radius:8px;font:12px/1.4 var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;}
.match-chat-newer {position:absolute;top:55px;left:50%;transform:translateX(-50%);background:#171b18!important;font-size:10px!important;box-shadow:0 3px 15px #0004;}
.match-chat-outgoing {font-size:11px;line-height:1.5;padding:6px 0;color:#e8ddc5a6;}
.match-chat-outgoing button {min-height:44px;font-size:10px;margin-left:6px;}
body.paused .match-chat,body.result .match-chat,body.paused #match-chat-toggle {visibility:hidden;}
.match-chat[data-keyboard='true'] .match-chat-controls {display:none;}

@media(max-height:450px) {.match-chat-panel{width:min(480px,calc(100vw - 16px));height:var(--chat-height,calc(100dvh - 60px));}.match-chat-phrases{margin-top:2px}.match-chat-controls summary{min-height:44px}.match-chat-line{padding:12px 0}.match-chat-foot{padding:5px 8px;}}
@media(max-width:600px) {.match-chat-panel{width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));height:var(--chat-height,calc(100dvh - 64px));}.match-chat-head{padding-left:18px;}.match-chat-text{font-size:14px;}.match-chat-log{padding-inline:18px;}}
@media(prefers-reduced-motion:reduce) {.match-chat button:active{transform:none}}
.reduce-motion .match-chat button:active{transform:none;}
`;

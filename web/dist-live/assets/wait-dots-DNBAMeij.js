var e=`futasaku-wait-dots`,t=`
.${e} { display:inline-flex; align-items:flex-end; gap:2px; margin-left:2px; }
/* A display:inline-flex author rule beats the browser's own [hidden] { display:none }, so the
   shared dots carry their own hidden rule: any caller may set dots.hidden = true and trust it. */
.${e}[hidden] { display:none !important; }
.${e} i { width:3px; height:3px; border-radius:50%; background:currentColor; opacity:1;
  animation: futasaku-wait-dot 1.35s ease-in-out infinite both; }
.${e} i:nth-child(2) { animation-delay:.22s; }
.${e} i:nth-child(3) { animation-delay:.44s; }
@keyframes futasaku-wait-dot { 0%, 6% { opacity:.15 } 26%, 100% { opacity:1 } }
/* Reduce motion: a steady ellipsis, still legible as "waiting", with nothing animating. */
.reduce-motion .${e} i { animation:none !important; opacity:1; }
@media (prefers-reduced-motion: reduce) { .${e} i { animation:none !important; opacity:1; } }
`,n=()=>{let t=document.createElement(`span`);return t.className=e,t.setAttribute(`aria-hidden`,`true`),t.append(document.createElement(`i`),document.createElement(`i`),document.createElement(`i`)),t};export{n,t};
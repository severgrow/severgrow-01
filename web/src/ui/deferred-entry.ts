/** Optional screens mount asynchronously. Retain one deliberate early click without hiding PLAY. */
export function deferEntryButton(button: HTMLButtonElement, screens: EventTarget | null = typeof window === 'undefined' ? null : window) {
  let pending=false, ready=false;
  const capture=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();pending=true;
    button.setAttribute('aria-busy','true');
  };
  const cancel=()=>{pending=false;button.removeAttribute('aria-busy');};
  screens?.addEventListener('futasaku:screen',cancel);
  button.addEventListener('click',capture,true);
  return {
    ready(){
      if(ready)return;ready=true;
      button.removeEventListener('click',capture,true);button.removeAttribute('aria-busy');
      screens?.removeEventListener('futasaku:screen',cancel);
      // Going Back or starting a game cancels the intent. Never surprise the player later.
      if(pending&&!button.closest('[hidden],[inert]'))button.click();
      pending=false;
    },
  };
}

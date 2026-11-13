/** Do not interrupt a real gesture, or retain a gesture whose release happened outside the app. */
export const mountPointerBusy = (doc: Document = document, win: Window = window) => {
  const held = new Set<number>();
  const abort = new AbortController();
  const options = {capture:true,passive:true,signal:abort.signal};
  const clear = () => held.clear();
  doc.addEventListener('pointerdown', e=>held.add(e.pointerId),options);
  doc.addEventListener('pointerup', e=>held.delete(e.pointerId),options);
  doc.addEventListener('pointercancel', e=>held.delete(e.pointerId),options);
  win.addEventListener('blur',clear,options);
  win.addEventListener('pagehide',clear,options);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clear();},options);
  return {active:()=>held.size>0,dispose:()=>{abort.abort();clear();}};
};

// The first-paint cover also shields installed-app snapshots when leaving the app.
// Native iOS launch screens precede JavaScript; keep the existing apple startup images too.
export const BOOT_COVER_MAX_MS = 1200;
export const BOOT_COVER_FADE_MS = 1000;
export const BOOT_RESUME_FADE_MS = 220;

export const liftBootCover = (opts: { reduceMotion: boolean }): void => {
  const cover = document.getElementById('boot-cover');
  const root = document.documentElement;
  if (!cover || !root.classList.contains('space-first') || cover.dataset.bootMounted) return;
  cover.dataset.bootMounted = 'true';
  let frame=0, deadline:ReturnType<typeof setTimeout>|undefined, finish:ReturnType<typeof setTimeout>|undefined;
  const clear = () => {
    cancelAnimationFrame(frame);frame=0;
    clearTimeout(deadline);clearTimeout(finish);deadline=finish=undefined;
  };
  let suspended=false;
  const shield = () => {
    suspended=true;
    clear();cover.style.transition='none';cover.style.opacity='1';cover.hidden=false;
  };
  const composed = () => {
    if (document.fonts?.status === 'loading') return false;
    if (document.getElementById('menu')?.hidden) return true;
    return root.classList.contains('planet-lockup') &&
      document.querySelector<HTMLElement>('.planet-canvas')?.dataset.planetReady === 'true';
  };
  const reveal = (resume=false) => {
    clear();let lifted=false;
    const lift = () => {
      if(lifted || document.hidden)return;
      lifted=true;clear();
      const reduced=opts.reduceMotion || (typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if(reduced){cover.hidden=true;return;}
      const duration=resume?BOOT_RESUME_FADE_MS:BOOT_COVER_FADE_MS;
      cover.style.transition=`opacity ${duration}ms ease-out`;cover.style.opacity='0';
      finish=setTimeout(()=>{cover.hidden=true;finish=undefined;},duration+40);
    };
    const check=()=>{
      if(composed())frame=requestAnimationFrame(lift);
      else frame=requestAnimationFrame(check);
    };
    frame=requestAnimationFrame(check);
    deadline=setTimeout(lift,BOOT_COVER_MAX_MS);
  };
  // /test already reveals the whole body through startup.ts. Never stack two entrances.
  if(root.dataset.startup==='waiting')cover.hidden=true;else reveal();
  const installed=(navigator as Navigator & {standalone?:boolean}).standalone===true ||
    (typeof matchMedia==='function' && matchMedia('(display-mode: standalone)').matches);
  if(installed){
    const resume=()=>{if(suspended){suspended=false;reveal(true);}};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)shield();else resume();});
    window.addEventListener('pagehide',shield);
    window.addEventListener('pageshow',event=>{if(event.persisted)resume();});
  }
};

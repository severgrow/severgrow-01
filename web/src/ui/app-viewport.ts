/** One height for installed-app paint AND layout. Never infer a Safari tab from screen size. */
export const appViewport = (v: {
  width: number; height: number; visualWidth: number; visualHeight: number;
  screenWidth: number; screenHeight: number; largeHeight: number; standalone: boolean;
}): {w: number; h: number} => {
  if (!v.standalone) return {w: Math.round(v.visualWidth), h: Math.round(v.visualHeight)};
  const screenFits = v.width <= 600 && v.height > v.width && Math.abs(v.screenWidth-v.width)<=2 &&
    v.screenHeight>=v.height && v.screenHeight-v.height<v.height*.16;
  return {w: Math.round(v.width), h: Math.round(Math.max(v.height, v.largeHeight, screenFits ? v.screenHeight : 0))};
};

/** CSS knows the large viewport even when iOS's innerHeight is stale. No timer or polling. */
export const readAppViewport = (): {w: number; h: number} => {
  const standalone = document.documentElement.classList.contains('home-screen-app');
  let largeHeight = 0;
  if (standalone) {
    let probe = document.getElementById('app-viewport-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'app-viewport-probe';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;contain:strict';
      document.body.append(probe);
    }
    largeHeight = probe.getBoundingClientRect().height;
  }
  const vv = window.visualViewport;
  return appViewport({width:innerWidth,height:innerHeight,visualWidth:vv?.width??innerWidth,
    visualHeight:vv?.height??innerHeight,screenWidth:screen.width,screenHeight:screen.height,largeHeight,standalone});
};

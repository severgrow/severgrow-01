/** The visible viewport owns keyboard-facing sheets; the board keeps its stable app viewport. */
export const sheetViewport = (top: number, height: number, padTop = 16, padBottom = 16) => {
  const y = Number.isFinite(top) ? Math.max(0, top) : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 640;
  const start = Math.min(h / 2, Math.max(0, padTop));
  const end = Math.min(h / 2, Math.max(0, padBottom));
  return { top: y, centre: y + (h + start - end) / 2, height: h, maxHeight: Math.max(1, h - start - end) };
};

/** One mount per persistent sheet. No polling; callers fit again when showing a hidden surface. */
export const mountSheetViewport = (panel: HTMLElement, overlay?: HTMLElement): (() => void) => {
  const fit = () => {
    if ((overlay ?? panel).hidden) return;
    const viewport = window.visualViewport;
    const padding = overlay ?? document.getElementById('safe-probe');
    const style = padding ? getComputedStyle(padding) : null;
    const v = sheetViewport(viewport?.offsetTop ?? 0, viewport?.height ?? innerHeight,
      style ? Math.max(16, parseFloat(style.paddingTop) || 0) : 16,
      style ? Math.max(16, parseFloat(style.paddingBottom) || 0) : 16);
    if (overlay) {
      Object.assign(overlay.style, { top: `${v.top}px`, bottom: 'auto', height: `${v.height}px`, boxSizing: 'border-box' });
    } else panel.style.top = `${v.centre}px`;
    Object.assign(panel.style, { maxHeight: `${v.maxHeight}px`, overflowY: 'auto', overscrollBehavior: 'contain' });
  };
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  return fit;
};

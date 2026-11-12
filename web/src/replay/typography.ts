/** Read the game's body-scoped role, not a private export font stack. */
export const replayUIFamily = (): string => {
  if (typeof document === 'undefined' || !document.body) return "'Fragment Mono', ui-monospace, monospace";
  const style = getComputedStyle(document.body);
  return style.getPropertyValue('--font-ui').trim() || style.fontFamily || "'Fragment Mono', ui-monospace, monospace";
};

/** Canvas doesn't wait for web fonts and doesn't inherit CSS font-synthesis:none. */
export const warmReplayUI = async (): Promise<void> => {
  try { await globalThis.document?.fonts?.load(`400 30px ${replayUIFamily()}`); }
  catch { /* The same family stack supplies the game's fallback when a font is unavailable. */ }
};

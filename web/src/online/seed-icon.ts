/** The ONE way a Seeds balance is written for the player ("128 SEEDS"), shared by the Territory
 *  wallet and the menu's read-out so the two can never drift apart. */
export const seedBalanceLabel = (balance: number): string => `${balance} SEEDS`;

/** One authored icon at every Seeds size; currentColor keeps the ivory material intact. */
export const seedIcon = (size = 20): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('seed-icon');
  const add = (tag: string, attributes: Record<string, string>) => {
    const child = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
    svg.append(child);
  };
  add('path', { d: 'M16 27C8 22 7 16 11 11c3-4 10-5 14-7 0 8-1 15-6 20-1 1-2 2-3 3Z',
    fill: 'currentColor', stroke: '#c9ad70', 'stroke-width': '0.7', 'stroke-linejoin': 'round' });
  add('path', { d: 'M13 21c3-3 6-7 9-12', fill: 'none', stroke: '#536a47', 'stroke-width': '1.6', 'stroke-linecap': 'round' });
  add('path', { d: 'M16 16c-3-2-5-2-7-2', fill: 'none', stroke: '#536a47', 'stroke-width': '1.2', 'stroke-linecap': 'round' });
  return svg;
};

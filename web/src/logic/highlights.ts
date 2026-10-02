// Three highlights for the game-over screen, computed from the game's event history.
import type { Event, Player } from '../../../src/engine/index.js';
import { OPP } from '../../../src/strings.js';

export type Highlight = { title: string; by: Player | null; value: number; text: string };

const tiles = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;

export const gameHighlights = (history: readonly Event[], viewer: Player): Highlight[] => {
  const who = (p: Player) => (p === viewer ? 'You' : OPP.The);
  let cut = { by: null as Player | null, n: 0 };
  let move = { by: null as Player | null, n: 0 };
  let grow = { by: null as Player | null, n: 0 };
  // Events of one action follow each other; a placement starts a new "move".
  let current: { by: Player; n: number } | null = null;
  const close = () => {
    if (current && current.n > move.n) move = { ...current };
    current = null;
  };
  for (const e of history) {
    if (e.t === 'MeldRun' || e.t === 'MeldSet' || e.t === 'Sprout') {
      close();
      const n = e.t === 'Sprout' ? 1 : e.hexes.length;
      current = { by: e.player, n };
      if (n > grow.n) grow = { by: e.player, n };
    } else if (e.t === 'Fruit') {
      close();
      current = { by: e.player, n: 1 };
    } else if (e.t === 'Sever') {
      const by = current?.by ?? (e.player === 0 ? 1 : 0);
      if (current && e.player !== current.by) current.n += e.coords.length;
      if (e.player !== by && e.coords.length > cut.n) cut = { by, n: e.coords.length };
    } else if (e.t !== 'Overgrow') close();
  }
  close();
  return [
    {
      title: 'Biggest cut',
      by: cut.by,
      value: cut.n,
      text: cut.by === null ? 'No cuts this game' : cut.by === viewer ? `You cut off ${cut.n} ${OPP.noun} ${cut.n === 1 ? 'tile' : 'tiles'}` : `${OPP.The} cut off ${cut.n} of your tiles`,
    },
    { title: 'Biggest single move', by: move.by, value: move.n, text: move.by === null ? 'No moves' : `${who(move.by)} changed ${tiles(move.n)} in one move` },
    { title: 'Most tiles at once', by: grow.by, value: grow.n, text: grow.by === null ? 'No tiles grown' : `${who(grow.by)} grew ${tiles(grow.n)} at once` },
  ];
};

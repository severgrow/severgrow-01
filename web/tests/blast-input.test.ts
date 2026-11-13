import { describe, expect, it } from 'vitest';
import { legalActions, viewFor } from '../../src/engine/index.js';
import { tutorialChapterById } from '../src/logic/tutorial-script.js';
import { blastForPair } from '../src/logic/blast-input.js';
import { kindOf, EMPTY_SEL } from '../src/logic/interaction.js';
import { resolveDrag } from '../src/logic/drag.js';

const state = tutorialChapterById('blast');
const view = viewFor(state, 0), legal = legalActions(view);
const blast = legal.find(a => a.t === 'MegaBomb')!;
if (blast.t !== 'MegaBomb') throw Error('fixture needs a Blast');
const [first,second] = blast.cards as [number,number];
const kind = kindOf(blast)!;

describe('Blast combination input', () => {
  it('two distinct Bomb taps select the legal recipe in either order', () => {
    expect(blastForPair(legal,first,second)).toBe(kind);
    expect(blastForPair(legal,second,first)).toBe(kind);
  });
  it('one card, the same card twice, another card or a stale recipe never select Blast', () => {
    expect(blastForPair(legal,null,first)).toBeNull();
    expect(blastForPair(legal,first,first)).toBeNull();
    expect(blastForPair(legal,first,-1)).toBeNull();
    expect(blastForPair([],first,second)).toBeNull();
  });
  const drag = (boardKey:string|null, phase = view.phase, offered = legal) => resolveDrag({
    view:{...view,phase},legal:offered,sel:EMPTY_SEL,
    source:{kind:'recipe',recipe:kind,cardId:first},distance:80,boardKey,
    overDiscardPile:false,shape:[],upSpeed:0,upTravel:0,
  });
  it('dragging the cockpit recipe commits exactly one Blast on its target', () => {
    const key = `${blast.target.q},${blast.target.r}`;
    expect(drag(key).commit).toEqual(blast);
    expect(drag(key).shape).toEqual([]);
  });
  it('an unpaired Bomb drag spends only that one card', () => {
    const r = resolveDrag({view,legal,sel:EMPTY_SEL,source:{kind:'hand',cardId:first},distance:80,boardKey:`${blast.target.q},${blast.target.r}`,overDiscardPile:false,shape:[],upSpeed:0,upTravel:0});
    expect(r.commit?.t).toBe('PlayFruit');
    expect(r.commit && 'card' in r.commit ? r.commit.card : null).toBe(first);
  });
  it('a missed drop, own home, stale recipe or the wrong phase never spends cards', () => {
    expect(drag(null).commit).toBeNull();
    expect(drag('-2,2').commit).toBeNull();
    expect(drag(null,'DRAW').commit).toBeNull();
    expect(drag(`${blast.target.q},${blast.target.r}`,view.phase,[]).commit).toBeNull();
  });
});

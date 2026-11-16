// THE TILE-SKIN SWITCH MUST WEAR WHAT THE PLAYER CHOSE (owner report, 2026-11-15: "with chosen
// forest in game it gives me water"). Behaviour, not internals: the switch talks to a server whose
// read is ASYNC, so the order in which a choice and that read arrive is not fixed. Whatever the
// order, the skin the board painter reads (`faSides()`, ui/forestAsh.ts) must be the skin the
// player chose — and the switch must never mark a skin the board is not wearing.
//
// The /test/ path is the surface this switch lives on (it is also live on a localhost dev host);
// `SKIN_SWITCH` is decided once, when the modules load, so the globals are stubbed before the
// dynamic imports below.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('location', {
  pathname: '/test/', hostname: 'futasaku.com', search: '', href: 'https://futasaku.com/test/',
});
const storageListeners = new Map<string, (event: { key: string | null; newValue: string | null }) => void>();
vi.stubGlobal('window', {
  addEventListener: (name: string, handler: (event: { key: string | null; newValue: string | null }) => void) => {
    storageListeners.set(name, handler);
  },
});
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});

const { connectSkinSwitch, disconnectSkinSwitch } = await import('../src/online/skin-switch.js');
const { chooseSkin, skinChoice } = await import('../src/ui/skinChoice.js');
const { faSides } = await import('../src/ui/forestAsh.js');

/** A client whose skin read answers only when the test says so. */
const deferredRead = () => {
  let settle!: (skin: string | null) => void;
  let fail!: (error: Error) => void;
  const answer = new Promise<string | null>((resolve, reject) => { settle = resolve; fail = reject; });
  const client = { worldSkin: () => answer, chooseWorldSkin: async () => 'forest' };
  return { client, settle, fail };
};
let tokens = 0;
const connect = (client: unknown) => connectSkinSwitch(
  client as unknown as Parameters<typeof connectSkinSwitch>[0],
  `token-${++tokens}`,
  () => undefined,
);

/** The two facts the owner compares: what the switch marks, and what the board draws. */
const drawn = () => faSides()[0];
const chosen = () => skinChoice().mine;

beforeEach(() => {
  disconnectSkinSwitch();
  data.clear();
  chooseSkin({ mine: 'water', theirs: 'ash', background: 'slate' });
});

describe('the tile-skin switch and the skin the board draws', () => {
  it('a read that started before the choice can never undo it', async () => {
    const { client, settle } = deferredRead();
    const reading = connect(client);        // the visit's read is in flight
    chooseSkin({ mine: 'forest' });         // the player chooses Forest meanwhile
    settle('water');                        // the older answer finally arrives
    await reading;
    expect(chosen(), 'the choice is still the player\'s').toBe('forest');
    expect(drawn(), 'the board draws the chosen skin').toBe('forest');
  });

  it('shows the browser\'s own choice while the read is in flight, never a default', async () => {
    const { client } = deferredRead();
    void connect(client);
    expect(chosen(), 'nothing has been chosen yet, so the switch must not claim Forest').toBe('water');
    expect(drawn(), 'the board wears the stored skin while the read is pending').toBe('water');
  });

  it('a read that fails leaves the choice exactly as it was', async () => {
    const { client, fail } = deferredRead();
    const reading = connect(client);
    fail(new Error('offline'));
    await expect(reading).resolves.toBeUndefined();
    expect(chosen()).toBe('water');
    expect(drawn()).toBe('water');
  });

  it('takes the account\'s own answer when nothing was chosen since the read started', async () => {
    const { client, settle } = deferredRead();
    const reading = connect(client);
    settle('forest');
    await reading;
    expect(chosen(), 'the account\'s saved skin is the truth for "your tiles"').toBe('forest');
    expect(drawn()).toBe('forest');
  });

  it('an empty answer never writes a default over the browser\'s choice', async () => {
    const { client, settle } = deferredRead();
    const reading = connect(client);
    settle(null);
    await reading;
    expect(chosen(), 'no saved skin is not the same as Forest').toBe('water');
    expect(drawn()).toBe('water');
  });

  it('another tab\'s choice becomes this tab\'s choice, and another channel\'s is ignored', () => {
    const listener = storageListeners.get('storage');
    expect(listener, 'the shared-storage listener is installed with the switch').toBeTypeOf('function');
    // A different channel's key on the same origin is a different line: it must not move this board.
    listener!({ key: 'futa05-test:severgrow.board-skin.v1', newValue: JSON.stringify({ mine: 'toxic' }) });
    expect(chosen(), 'another channel\'s skin is not this one\'s').toBe('water');
    // This channel's own key (channel.ts prefixes it) is this tab's choice too.
    listener!({ key: 'main2:severgrow.board-skin.v1', newValue: JSON.stringify({ mine: 'forest', theirs: 'ash', background: 'slate' }) });
    expect(chosen()).toBe('forest');
    expect(drawn(), 'the board follows the other tab at once').toBe('forest');
  });
});

# Future card-skin perspective

Owner decision, 13 November 2026. Record only; not implemented in the current input/polish pass.

## Online

Each client renders from its own perspective:

- Your hand uses your selected card skin.
- The opponent's hand and dealing animations use the opponent's selected skin.
- The shared Draw pile and Throw/discard pile use the opponent's skin on your screen.
- The opponent sees the reverse: their hand in their skin, your hand/dealing and the piles in yours.

Do not replace this with a single room-wide skin or with the skin of whoever discarded last.
The presentation needs explicit viewer/opponent ownership, separate from authoritative card identities.
Account IDs, cards, deck order, moves and legality do not change because of a cosmetic skin.

## Offline

Only the local player's selected skin is used: both hands, all dealing animations and both piles.
Do not give offline opponents independent card skins.

Keep this rule when designing the future skin registry and animation source/destination rendering.
There is no new skin selection, network metadata or rendering change in this documentation commit.

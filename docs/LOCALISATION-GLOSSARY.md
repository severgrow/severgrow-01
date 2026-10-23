# Futasaku localisation glossary

One meaning per word. These are the words the game actually uses after the 0.4/0.5 rules: **Draw →
Grow → Throw**, with **Bloom**, **Bomb** and **Blast** as extra moves. “Fruit” is an obsolete name
for the Bomb; it is never used in player copy.

| English | Meaning in play | Polski | Español | 日本語 | Notes |
|---|---|---|---|---|---|
| Draw | Take one card from the Draw pile (or the Throw pile when it glows) | Dobierz | Roba | 引く | Step LED: DOBIERZ / ROBA / 引く |
| Grow | Place or strengthen one tile with one card; once per turn | Rozwijaj | Crece | 育てる | Button / LED; noun “rozwój”, “crecimiento”, “成長” |
| Throw | Discard one card to end the turn | Rzuć | Descarta | 捨てる | The pile is “Stos rzutów”, “Pila de descartes”, “捨て札” |
| Bloom | Optional extra move: 3–6 matching cards grow that many tiles | Rozkwit (verb: Zakwitnij) | Floración (verb: Florece) | 開花 (verb: 咲かせる) | Never “set”/“run” alone in UI; both shapes are explained |
| Bomb | Numberless card that removes one touching opponent tile, even a 9 | Bomba | Bomba | ボム | Uses the turn's Grow |
| Blast | Two Bombs: clear a tile and its six neighbours (homes safe) | Wybuch (verb: Wysadź) | Estallido (verb: Estalla) | ブラスト | Extra move; does not use Grow |
| Skip | End the Grow step without growing | Pomiń | Saltar | スキップ | “Skip Grow” = “Pomiń rozwój” |
| Undo | Take back your last move this turn | Cofnij | Deshacer | 戻す | |
| Sort | Reorder the hand | Sortuj | Ordenar | 並べ替え | |
| Cancel | Abandon the current selection | Anuluj | Cancelar | キャンセル | |
| Clear | Remove the painted shape | Wyczyść | Borrar | クリア | |
| Reverse | Flip the number order of a run | Odwróć | Invertir | 逆順 | |
| Forest | The green side's terrain | Las | Bosque | 森 | |
| Volcano | The red side's terrain | Wulkan | Volcán | 火山 | |
| Home | The tile that must stay connected; surrounding it wins | Dom | Hogar | ホーム | Your home is “twoje drzewo” / “tu árbol” / “あなたの木” |
| Tile | One hexagonal board piece | Kafel | Casilla | タイル | Plural: kafle / kafli; casillas; タイル |
| Strength | The number on a tile | Siła | Fuerza | 強さ | |
| Card | A playing card | Karta | Carta | カード | |
| Deck / Draw pile | The face-down pile | Talia | Mazo | 山札 | |
| Discard / Throw pile | The face-up pile where thrown cards go | Stos rzutów | Pila de descartes | 捨て札 | |
| Turn | One player's Draw → Grow → Throw | Tura | Turno | 手番 | |
| Match | One complete game | Partia | Partida | 対戦 | “Duel” = pojedynek / duelo / 対戦 |
| Opponent | The other player | Przeciwnik | Rival | 相手 | Short label, not “oponent”/“oponente”/“対戦者” |
| Network | The connected tiles | Sieć | Red | ネットワーク | |
| Connected | Joined back to your home | Połączony | Conectada | つながっている | |
| Legal move | A move the rules allow now | Dozwolony ruch | Movimiento válido | 有効な手 | Never “legal” in the legal sense |
| Level | One campaign stage | Poziom | Nivel | レベル | The progression is never called “Campaign” |
| Victory | You won | Wygrywasz | Has ganado | 勝ちました | Finish title; fixed wording |
| Defeat | You lost | Przegrywasz | Has perdido | 負けました | |
| Draw (result) | No winner | Remis | Empate | 引き分け | Distinct from the Draw action |
| Play offline | Against the computer, no network | Gra offline | Jugar sin conexión | オフラインで遊ぶ | |
| Practice match | The offline tier picker (0.6 wording; no longer “Training”) | Gra treningowa | Partida de práctica | 練習対戦 | `menu.training`, `result.practice` |
| Play online | Online duels | Gra online | Jugar en línea | オンライン対戦 | |
| You start | You take the first turn | Ty zaczynasz | Empiezas tú | あなたが先手 | Also the pre-game animation |
| Opponent starts | The other side takes the first turn | Przeciwnik zaczyna | Empieza tu rival | 相手が先手 | Also the pre-game animation |
| Real time | Short per-turn clock on the same match | Na żywo | Tiempo real | リアルタイム | Leaving loses the match |
| Territory | The shared world map | Terytorium | Territorio | テリトリー | |
| Seeds | The world-map currency | Nasiona | Semillas | シード | |
| Gold hex | A hex that scores double | Złoty heks | Hexágono de oro | 金のマス | |
| Rock | A hex where nothing grows | Skała | Roca | 岩 | |
| Wither | Tiles cut off from home are removed | Usychają | Se marchitan | 枯れる | |
| Strangle | Surrounding a home for an instant win | Otoczenie | Rodeo | 包囲 | Never shown as “strangle” in the tutorial |

## Deliberate decisions

- **Polish “Rozwijaj”** rather than a literal “Rośnij”: it reads as developing a network, works for
  both placing and strengthening, and avoids the comic image of talking to a plant.
- **Polish “Rzuć”** for Throw, with “Stos rzutów”: the pile keeps the same verb as the action. Polish
  card players also know “odrzuć”, but mixing the two would give one mechanic two names.
- **Spanish “Descarta”** for Throw: “Lanzar una carta” is literal but uncommon in card games;
  “descartar” is the natural, pan-regional verb. The flavoured name of the pile stays “descartes”.
- **Spanish “Rival”** everywhere: shorter than “Oponente” in a compact cockpit, and natural in Spain
  and Latin America.
- **Japanese “育てる”** for Grow and **“開花”** for Bloom: the farming/garden metaphor is native to
  Japanese games and needs no loanword. **“ボム”** is the established short game word for a bomb.
- **Japanese “捨てる”** for Throw: the literal “投げる” would read as throwing an object, not
  discarding a card. “捨て札” is the standard word for the discard pile.
- **Bomb, not Fruit**, in every language. The engine ids `PlayFruit` / `fruit*` remain for
  compatibility and are never shown.
- **Draw (action) vs Draw (result)** are distinct keys in every dictionary: “Dobierz” vs “Remis”,
  “Roba” vs “Empate”, “引く” vs “引き分け”.

## Formality and address

- Polish: second person singular, direct imperative. No “Pan/Pani”.
- Spanish: “tú” throughout, never “vosotros”; neutral vocabulary understood in Spain and Latin
  America.
- Japanese: short verb/noun buttons (引く・育てる・捨てる・開花); explanations in です・ます. No
  honorifics and no slang.

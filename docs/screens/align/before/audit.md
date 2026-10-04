# Alignment audit

Offsets are the horizontal distance (pt) of each part's centre from its centre line (+ is right
of centre): the screen's for the header; on wide screens (board and dock side by side) the board
is measured against its column and the piles, hint and hand against the dock's column. "Above / below" is the space between the drawn board and its zone.
Margins are left / right. "Lone" lists visible controls whose mirrored partner is not shown.

| viewport | pill | race tick | board | piles | hint | hand | board above / below | tile width | board margins | hand margins | lone controls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 360x640 | -0.01 | 0 | -0.05 | -99.86 | -0.01 | -16 | 3.2 / 4.6 | 49.21 | 25 / 25.1 | 7.3 / 39.3 | #hint-btn, #hand-sort |
| 390x844 | -13.95 | 0 | -0.06 | -104.95 | -0.01 | -16 | 20.9 / 25.4 | 58.23 | 11.6 / 11.7 | 1.8 / 33.8 | #hint-btn, #hand-sort |
| 430x932 | -2.96 | 0 | -0.06 | -124.95 | -0.01 | -16.01 | 21.3 / 25.6 | 64.46 | 12 / 12.1 | -2.5 / 29.6 | #hint-btn, #hand-sort |
| 768x1024 | -0.01 | 0 | -1.23 | -303.86 | -0.01 | -16 | 11 / 12.8 | 106.35 | 12.3 / 14.7 | 50.8 / 82.8 | #hint-btn, #hand-sort |
| 1280x800 | -0.01 | 0 | -1.25 | -107.24 | -0.01 | -16 | 24.8 / 25 | 108.33 | 48.4 / 476.9 | 835.3 / 69.3 | #hint-btn, #hand-sort |

# Carreau

A 2D mobile puzzle game based on a notebook sketch: four pieces sit in the corners of a square board, and swipes reshape them.

## Rules

Each corner piece is one of four shapes:

| Shape | Width × height |
| --- | --- |
| Carreau (small square) | 1 × 1 |
| Rectangle horizontal | 2 × 1 |
| Rectangle vertical | 1 × 2 |
| Carreau grand (big square) | 2 × 2 |

- A **horizontal swipe** (← or →) toggles a piece's width: carreau ↔ rectangle horizontal, rectangle vertical ↔ carreau grand.
- A **vertical swipe** (↑ or ↓) toggles its height: carreau ↔ rectangle vertical, rectangle horizontal ↔ carreau grand.
- Where you swipe picks the pair: a horizontal swipe in the top half affects the two top pieces, bottom half the two bottom ones; a vertical swipe in the left half affects the two left pieces, right half the two right ones. The arrows around the board do the same when tapped.

Match the target shape shown above the board before the 60-second clock runs out. Matching in the fewest possible moves gives +3 s, otherwise +1 s.

Desktop: arrow keys or W A S D (the arrow points at the edge it works).

## Run it

It is a single static file. Open `index.html` in a browser, or serve the folder (`npx serve .`) and open it on your phone.

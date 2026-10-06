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

## Modes

- **Rush**: match as many target shapes as you can in 60 seconds. A match in the fewest possible moves gives +3 s, any other match +1 s.
- **Levels**: 30 fixed puzzles with a move limit. Later levels chain two or three targets to hit in order. Fewest moves earns ★★★, one extra move ★★, otherwise ★. Clearing a level unlocks the next.
- **Memory**: the target shows briefly, then hides. Rebuild it in exactly the minimum number of moves. Three lives.
- **Zen**: endless targets, no clock.

Sound (synthesized with Web Audio) and vibration on a correct match can each be switched off with the buttons in the top right. Settings, best scores and level stars are saved on the device.

Desktop: arrow keys or W A S D (the arrow points at the edge it works).

## Platform plan

The game stays a web app and will be wrapped with [Capacitor](https://capacitorjs.com/) for the Android APK (and iOS later). Note that browsers on iPhone do not support vibration; the Capacitor Haptics plugin will cover that in the app build.

## Run it

It is a single static file. Open `index.html` in a browser, or serve the folder (`npx serve .`) and open it on your phone.

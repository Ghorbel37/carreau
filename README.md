# Carreau

A 2D mobile puzzle game based on a notebook sketch: pieces sit in the corners of a board, and swipes reshape them.

**Play in the browser:** <https://ghorbel37.github.io/carreau/> (updated on every push to `main`).

**Google Play:** the store version is prepared; see [docs/PLAY_STORE.md](docs/PLAY_STORE.md) for the publishing checklist.

**Try it on Android:** open <https://github.com/Ghorbel37/carreau/releases/latest/download/carreau.apk> on your phone, then open the downloaded file and allow installs from that source when asked. New builds install over the old one and keep your progress.

## Rules

Every piece sits in a corner and has two lengths, each 1 or 2, one along each side that meets at its corner. **Swiping along a side toggles the length of the two pieces on that side.** When a board has two parallel sides, the swipe works the one on the half of the board where it starts. Tapping the arrows outside a side does the same.

On the square board that is exactly the notebook rule:

| Shape | Width × height |
| --- | --- |
| Carreau (small square) | 1 × 1 |
| Rectangle horizontal | 2 × 1 |
| Rectangle vertical | 1 × 2 |
| Carreau grand (big square) | 2 × 2 |

- A **horizontal swipe** (← or →) toggles a piece's width: carreau ↔ rectangle horizontal, rectangle vertical ↔ carreau grand.
- A **vertical swipe** (↑ or ↓) toggles its height: carreau ↔ rectangle vertical, rectangle horizontal ↔ carreau grand.
- A horizontal swipe in the top half affects the two top pieces, in the bottom half the two bottom ones; a vertical swipe in the left half affects the two left pieces, in the right half the two right ones.

## Worlds

| World | Board | Pieces | Notes |
| --- | --- | --- | --- |
| Triangle | triangle | 3 diamond-like corners | 3 swipe directions, no halves to pick. The gentlest; open from the start. |
| Carreau | square | 4 rectangles | The original sketch. |
| Ruche | hexagon | 6 slanted corners | 6 sides on 3 axes. The hardest. |

Each world keeps its own best scores.

Keyboard: number keys work side 1, 2, 3…; on the square board the arrow keys and W A S D work the side they point at. Esc goes back.

## Modes

- **Gates** (the main mode): walls with holes in a target shape fly at the board, growing as they come closer. Reshape the pieces to fit the holes before a wall arrives; a piece is outlined green once it fits, and the next wall is previewed. The HUD shows the fewest swipes the wall needs. Score = 100 + up to 100 for clearing early + 50 for no wasted swipe, times the combo (walls cleared in a row, up to ×10). A **wasted swipe** is one that takes the board further from the target: each one takes a quarter off that wall's points (never below a quarter) and a step off the combo. A crash costs one of three lives and resets the combo; every 15 walls cleared gives a life back. Walls get faster and need more swipes as the run goes on.
  - **Special walls** (from wall 6): **blink** — the holes close partway, fit them from memory; **locked** — one side is chained and can't be swiped; **gold** — 30% faster, triple points; **double** — the next wall follows close behind.
  - **Power-ups** ride on some walls (from wall 7); clear the wall to collect: **slow** (walls at half speed for 5 s), **shield** (the next crash costs no life and keeps the combo), **skip** (the current wall vanishes).
- **Daily**: the same walls for everyone each day, in a world that changes daily (any world, even one you haven't unlocked). The first run of the day counts and builds your streak; later runs are practice.
- **Precision**: Gates for careful players. Walls come 25% slower, but every wasted swipe immediately costs a life and resets the combo; clean clears score ×1.5.
- **Rush**: match as many shapes as you can against a 60-second clock.
- **Zen**: endless shapes, no clock.
- **How to play** (link under the modes): a three-wall guided tutorial, also shown the first time you play Gates.

**Worlds unlock in order:** Triangle is open from the start, Carreau opens at 25,000 points in Triangle Gates, Ruche at 60,000 in Carreau.

**Stats and achievements** (trophy button): lifetime stats and 14 achievements, which pop up as you earn them.

**Sound:** synthesized effects, plus a generative music loop that speeds up with the walls. Sound, music and vibration (a light tap per swipe, stronger on a match) each have a toggle. In a game the menu bar steps aside; the round pause button (or Esc / the Android back button) opens a full-screen pause menu that hides the board, with Resume, Restart, Menu and the sound, music and vibration toggles. Games also pause when you leave the app.

Testing aid: `?kinds=gold,locked&drops=,shield` forces the kind and power-up of walls 1, 2, … in Gates.

## Web and store versions

`node scripts/build.js web` builds the GitHub Pages version (Google Play promos, offline cache) into `dist/web`; `node scripts/build.js app` builds the store version (no promos, a Rate button, no service worker) into `dist/app`, which Capacitor packages. Details in [docs/PLAY_STORE.md](docs/PLAY_STORE.md).

## Project layout

| Path | What it is |
| --- | --- |
| `www/` | The game: `index.html`, `style.css`, `game.js` (modes, screens, input, progress), `board.js` (SVG board, wall and effects), `audio.js` (sound effects and music), `core.js` (rules, geometry, walls, daily, unlocks, achievements; shared with the tests), self-hosted fonts, icons, web manifest and offline service worker |
| `scripts/` | `build.js` (web / app builds), `serve.js` (local server), `store-screenshots.js` (Play Store screenshots) |
| `fastlane/metadata/android/` | Play Store listing: texts, icon, feature graphic (screenshots come from CI) |
| `android/` | Capacitor Android project (generated by `npx cap add android`, icons from `assets/`) |
| `assets/` | Source images for the Android icon and splash (`npx @capacitor/assets generate --android`) |
| `test/unit/` | Rule tests (`node --test`) |
| `test/e2e/` | Playwright tests that play every mode on a phone and a desktop viewport |

## Develop

```sh
npm install
npm start            # http://localhost:4173
npm test             # unit + browser tests (run `npx playwright install chromium` once)
```

## Android

The web game is wrapped with [Capacitor](https://capacitorjs.com/) (portrait only). The app uses the native Haptics, App (back button) and SystemBars (status bar icons) plugins.

```sh
npm run android:build   # needs JDK 21 and the Android SDK
```

Builds are signed with `android/app/carreau-test.keystore`, a test key that is public on purpose so every build can update the last one. Make a private key before publishing to the Play Store.

## CI

`.github/workflows/ci.yml` runs the unit tests and the browser tests, then, on `main`, publishes the web version to GitHub Pages and builds the APK, checks its package name, version and signature, and publishes it as a GitHub release tagged `v1.1.<run number>` with `carreau-v1.1.<run number>.apk` and `carreau.apk` (the stable link above always points at the latest).

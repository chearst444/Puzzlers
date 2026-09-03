# Puzzlers — Match-3 Sliding Puzzle

A self-contained match-3 puzzle game built with HTML5, CSS, and vanilla
JavaScript — no build step, no dependencies. Every gem is a cropped PNG of
an actual marker drawing (`assets/handmade/`): pentagon/diamond/rectangle
in the game's mint/teal, forest green, and pink/magenta palette, plus
circle, square, heart, and star each in their own accent color.

## Play it

Serve the folder with any static file server and open `index.html`:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

There's nothing to build or install.

## How it works

- **Board** — an 8×8 grid (`js/game.js`) filled with gems from an explicit
  13-type roster (`GEM_TYPES`): pentagon/diamond/rectangle × teal/forest/
  pink, plus circle (yellow), square (navy), heart (orange), and star
  (purple), seeded so no match exists before the first move.
- **Moves** — tap a gem then an adjacent one, or drag/swipe a gem into a
  neighboring cell. A swap that doesn't create a match slides back.
- **Matching** — runs of 3+ identical shape+color gems clear, remaining gems
  fall with gravity, and the board refills from the top; chained matches
  score combo multipliers.
- **Power meter** — every cleared gem charges the pink power pill. At 100%
  it unlocks a bonus word and clears a random row + column as a
  board-clearing obstacle, then resets.
- **Handmade art** — each `.gem__art` element just points its
  `background-image` at a cropped PNG of the real marker drawing matching
  its shape+color (nine combos total, no runtime recoloring). A JS-driven
  `--gem-scale` custom property scales it to any board size.
- **Mobile** — a locked viewport meta tag, `touch-action: none` on the
  board, and explicit `touchmove`/`gesturestart`/double-tap guards stop
  pinch-zoom and rubber-banding so the board behaves like a native app on
  phones; CSS media queries reflow the HUD for portrait vs. landscape.

## Palette

| Family | Highlight | Light | Base | Shadow |
|---|---|---|---|---|
| Mint & Teal | `#40E0D0` | `#2EE898` | `#16C47F` | `#0E8345` |
| Forest & Leaf | `#33D17A` | `#1FA463` | `#0F6B38` | `#0A4220` |
| Gemstone Pink | `#FF66B2` | `#E6397E` | `#B82A61` | `#801A42` |

UI neutrals: `#FFFFFF` panel fill, `#E2F8EE` background tint, `#1A1A1A`
borders/text.

## Structure

```
index.html            App shell + HUD markup
css/style.css          Palette, gem art wiring, layout, responsive rules
js/game.js              Board model, match/gravity engine, input, power-ups
assets/
  handmade/                 Hand-drawn gem art (PNG) + cursor sprites (SVG)
```

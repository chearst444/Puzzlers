# Puzzlers — Bracket Racket

A self-contained match-3 puzzle game built with HTML5, CSS, and vanilla
JavaScript — no build step, no dependencies. Every gem is a cropped PNG of
an actual hand-drawn marker sketch (`assets/handmade/`) — a deliberately
different set of shapes than the Match-3 game, so the two don't look like
reskins of each other: a stacked "tab" mark and a pair of brackets
(`[`/`]`), each in pink, teal, purple, and cream. Matching is by color;
shape is just cosmetic variety within a color.

## Play it

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

There's nothing to build or install.

## Palette

| Name             | Hex       | Role                     |
| ---------------- | --------- | ------------------------ |
| Tomato Red       | `#E9453A` | gem color                |
| Squash Orange    | `#F3814D` | gem color                |
| Marigold Yellow  | `#EBDA61` | gem color                |
| Sky Teal         | `#44B4C4` | gem color                |
| Olive Vine       | `#BFA749` | gem color                |
| Blush Pink       | `#E8C4DE` | page & board background  |
| Ink Outline      | `#2E292B` | gem strokes & grid lines |

## How it works

- **Board** — an 8×8 grid (`js/game.js`) filled with gems from 3 shapes
  (gem, diamond, heart) × 5 colors, seeded so no match exists before the
  first move and at least one legal move is always available.
- **Moves** — tap/click a gem then an adjacent one, or drag a gem into a
  neighboring cell. A swap that doesn't create a match slides back.
- **Matching** — standard match-3 rules: runs of 3+ gems of the same color
  (horizontal or vertical) clear, remaining gems fall with gravity, and the
  board refills from the top. Chain reactions from a single swap score
  increasing combo multipliers.
- **No legal moves left** — the board silently reshuffles until a move is
  possible again.
- **Score** — persists a best score locally (`localStorage`) across sessions.

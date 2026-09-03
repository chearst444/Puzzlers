# Growth Meter — a Daily Bread devotional puzzle

A self-contained devotional mini-game built with HTML5, CSS, and vanilla
JavaScript — no build step, no dependencies, no bitmap assets. Every visual
(the striped growth meter, the vine tiles, the match-card icons) is drawn
with CSS and inline SVG, recolored into the **Harvest Palette** below. It's
part of the **Daily Bread** track: five short puzzles, five short scriptures.

## Play it

Serve the folder with any static file server and open `index.html`:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## How it works

- **Growth meter** — a horizontal striped progress bar in the style of
  Kenney's UI progress-bar packs, rebuilt in pure CSS (`css/style.css`) so
  it can be recolored freely: a Marigold Yellow outer frame stands in for
  the bar's rounded end-caps, a Blush Pink inner track is the empty state,
  and each of the 5 segments fills independently with a diagonally-striped
  Sky Teal bar as its stage is solved.
- **Five stages** — alternating two puzzle types, generated in
  `js/game.js`:
  - **Vine path** (stages 1, 3, 5) — a small grid of rotatable vine tiles.
    Tap a tile to turn it 90°; connect the seed port to the bud port and
    the whole run glows. Tile shapes and their solved rotation are derived
    generically from an ordered path of grid cells, so new layouts are just
    a list of coordinates (see `definePipePath`).
  - **Match pairs** (stages 2, 4) — a small memory-flip board using
    seed/rain/sun/leaf icons, each pair sharing a Harvest Palette color.
- **Stage icons** — the row above the meter shows a seed → root → stem →
  bud → harvest icon per stage; each turns Squash Orange once its puzzle
  is solved.
- **Reflections** — completing a stage's puzzle reveals a short King James
  Version verse plus a one-line reflection tied to that stage's growth
  metaphor, before moving on to the next. A closing "Harvest" screen
  recaps all five once the meter is full, with a "Plant Again" reset.
- **Mobile** — a locked viewport meta tag and `touch-action`/user-select
  guards keep the board from pinch-zooming or rubber-banding on phones.

## Harvest Palette

| Name | Hex | Used for |
|---|---|---|
| Tomato Red | `#E9453A` | reserved accent |
| Squash Orange | `#F3814D` | completed-stage icons, vine leaf nodes |
| Marigold Yellow | `#EBDA61` | growth-meter end-caps, exit ports |
| Sky Teal | `#44B4C4` | growth-meter fill, solved-vine glow, primary button |
| Olive Vine | `#BFA749` | unsolved vine strokes, filler-cell soil dots |
| Blush Pink | `#E8C4DE` | growth-meter track background, track-tag pill |
| Ink Outline | `#2E292B` | text, borders |

## Structure

```
index.html       App shell: HUD (meter + stage icons), stage container, overlays
css/style.css     Palette, striped-meter styling, vine/match puzzle styling
js/game.js         Stage data, vine-path geometry engine, match engine, controller
```

# Puzzlers — Pipe Flow

A self-contained pipe-connection puzzle built with HTML5, CSS, and vanilla
JavaScript — no build step, no dependencies. Tap a pipe to rotate it 90° and
route the flow from the spout to the drain without leaks. The four pipe
shapes (`assets/pipes/`) are hand-drawn — real cropped linework, with an
empty and a flowing (teal-filled) variant of each.

## Play it

Serve the folder with any static file server and open `index.html`:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

There's nothing to build or install.

## How it works

- **Level generation** (`js/game.js`) — each level carves a randomized
  depth-first-search maze over an N×N grid (N grows from 5 up to 8 as the
  level counter climbs), then walks the maze's spanning tree from the fixed
  spout (top-left) to the fixed drain (bottom-right) to get a guaranteed
  solvable route. Every cell on that route is assigned the exact pipe shape
  and orientation it needs to carry the flow, every other cell gets a random
  decoy pipe, and the route tiles' rotations are scrambled so the board never
  starts pre-solved.
- **Rotating** — tapping any non-fixed pipe turns it 90° clockwise with a
  spring-eased CSS transform transition.
- **Flow** — after every rotation, a flood fill walks outward from the spout
  through any tile whose open side lines up with its wet neighbor's open
  side. Every tile the flood reaches swaps from its empty sprite to its
  flowing-liquid sprite (cross-faded) and picks up a subtle animated
  shimmer. Reaching the drain solves the level.
- **Win state** — the solved route glows in sequence from spout to drain,
  confetti bursts from the drain, a "Flow Complete" toast appears, and the
  level counter bumps before the next (slightly larger) puzzle loads.

## Assets & palette

Pipe tiles are sourced from Kenney's pipe/tile asset pack (`elbow`, `T`,
`cross`, and `straight`, each with an *empty* and a *flowing* variant) and
recolored offline into this game's palette — see the histogram-based swap in
the design notes below. Recoloring works because the source art is flat-
shaded with exactly three tonal families (a dark outline stroke, a light
neutral pipe body, and a saturated water fill); each pixel's hue/saturation
is swapped for the target color while its original lightness is kept, which
preserves all of the source art's shading and highlights.

| Element | Color |
|---|---|
| Flowing liquid | Sky Teal `#44B4C4` |
| Pipe body | Marigold Yellow `#EBDA61` |
| Outline / stroke | Ink Outline `#2E292B` |
| Board tile grid | Blush Pink `#E8C4DE` |

Every sprite is exported as a square canvas with its open connector nubs
flush to the canvas edges (padding added only on the closed side), so any
shape can be rotated in 90° steps and dropped into any grid cell and its
pipe ends will always meet its neighbors' at the cell boundary.

## Structure

```
index.html            App shell + HUD markup
css/style.css          Palette, board grid, pipe/flow states, win animation
js/game.js              Maze-based level generation, flow flood-fill, input
assets/pipes/
  pipe-<shape>-empty.png   Unfilled pipe body (straight/elbow/t/cross)
  pipe-<shape>-flow.png    Same pipe with liquid flowing through it
```

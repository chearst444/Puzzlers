// =============================================================================
// Puzzlers — Pipe Flow
// A tap-to-rotate pipe-connection puzzle. Each level carves a guaranteed
// solvable route from the spout to the drain through a randomized-DFS maze,
// builds the exact pipe shape/orientation each route cell needs, scrambles
// every rotatable tile's rotation, and fills the rest of the grid with
// random decoy pipes. Tapping a tile rotates it 90°; flow is re-flooded from
// the spout after every move and the destination "solves" the level once a
// leak-free path connects all the way through.
// =============================================================================

(() => {
  'use strict';

  // ---- Direction encoding: 0=N, 1=E, 2=S, 3=W -------------------------------
  const DIR_NAMES = ['N', 'E', 'S', 'W'];
  const DIR_DELTA = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const opposite = (d) => (d + 2) % 4;

  const BASE_MASK = {
    straight: (1 << 0) | (1 << 2),         // N, S
    elbow:    (1 << 0) | (1 << 1),         // N, E
    t:        (1 << 1) | (1 << 2) | (1 << 3), // E, S, W
    cross:    15,                          // N, E, S, W
  };
  const SHAPES = Object.keys(BASE_MASK);

  const ASSET = (shape, wet) => `assets/pipes/pipe-${shape}-${wet ? 'flow' : 'empty'}.png`;

  function rotateMask(mask, r) {
    let out = 0;
    for (let i = 0; i < 4; i++) {
      if (mask & (1 << i)) out |= 1 << ((i + r) % 4);
    }
    return out;
  }

  function findRotation(shape, targetMask) {
    const base = BASE_MASK[shape];
    for (let r = 0; r < 4; r++) {
      if (rotateMask(base, r) === targetMask) return r;
    }
    return 0; // unreachable given how targets are derived
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --------------------------------------------------------------------------
  // Level generation
  // --------------------------------------------------------------------------
  function carveMaze(size) {
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    const parent = Array.from({ length: size }, () => Array(size).fill(null));

    (function dfs(r, c) {
      visited[r][c] = true;
      for (const d of shuffled([0, 1, 2, 3])) {
        const [dr, dc] = DIR_DELTA[d];
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (visited[nr][nc]) continue;
        parent[nr][nc] = { r, c, dir: d };
        dfs(nr, nc);
      }
    })(0, 0);

    // Walk the unique tree path from the destination back to the source.
    const path = [];
    let cur = { r: size - 1, c: size - 1 };
    while (!(cur.r === 0 && cur.c === 0)) {
      const p = parent[cur.r][cur.c];
      path.push({ r: cur.r, c: cur.c, dirIn: p.dir });
      cur = { r: p.r, c: p.c };
    }
    path.push({ r: 0, c: 0, dirIn: null });
    path.reverse();
    return path;
  }

  function buildGrid(size, path) {
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        type: 'pipe',
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        rotation: Math.floor(Math.random() * 4),
        isPath: false,
      }))
    );

    const source = { r: 0, c: 0, openIdx: path[1].dirIn };
    const last = path[path.length - 1];
    const dest = { r: last.r, c: last.c, openIdx: opposite(last.dirIn) };

    grid[source.r][source.c] = { type: 'source', isPath: true };
    grid[dest.r][dest.c] = { type: 'dest', isPath: true };

    for (let i = 1; i < path.length - 1; i++) {
      const cell = path[i];
      const sideIn = opposite(cell.dirIn);
      const sideOut = path[i + 1].dirIn;
      const requiredMask = (1 << sideIn) | (1 << sideOut);
      const shape = (opposite(sideIn) === sideOut) ? 'straight' : 'elbow';
      grid[cell.r][cell.c] = {
        type: 'pipe',
        shape,
        rotation: Math.floor(Math.random() * 4),
        isPath: true,
        solvedRotation: findRotation(shape, requiredMask),
      };
    }

    return { grid, source, dest };
  }

  function generateLevel(level) {
    const size = Math.min(5 + Math.floor((level - 1) / 3), 8);

    for (let attempt = 0; attempt < 25; attempt++) {
      const path = carveMaze(size);
      const { grid, source, dest } = buildGrid(size, path);
      const state = { size, grid, source, dest, path };
      if (!computeFlow(state).solved) return state;
      // Fully-solved-on-arrival (rare): re-scramble path rotations and retry.
      for (let i = 1; i < path.length - 1; i++) {
        const c = grid[path[i].r][path[i].c];
        c.rotation = Math.floor(Math.random() * 4);
      }
      if (!computeFlow(state).solved) return state;
    }
    return { size, grid: buildGrid(size, carveMaze(size)).grid, source: null, dest: null, path: [] };
  }

  // --------------------------------------------------------------------------
  // Flow simulation
  // --------------------------------------------------------------------------
  function effectiveMask(state, r, c) {
    const cell = state.grid[r][c];
    if (cell.type === 'source') return 1 << state.source.openIdx;
    if (cell.type === 'dest') return 1 << state.dest.openIdx;
    return rotateMask(BASE_MASK[cell.shape], cell.rotation);
  }

  function computeFlow(state) {
    const { size, source, dest } = state;
    const wet = Array.from({ length: size }, () => Array(size).fill(false));
    wet[source.r][source.c] = true;
    const queue = [{ r: source.r, c: source.c }];

    while (queue.length) {
      const { r, c } = queue.shift();
      const mask = effectiveMask(state, r, c);
      for (let d = 0; d < 4; d++) {
        if (!(mask & (1 << d))) continue;
        const [dr, dc] = DIR_DELTA[d];
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size || wet[nr][nc]) continue;
        const neighborMask = effectiveMask(state, nr, nc);
        if (neighborMask & (1 << opposite(d))) {
          wet[nr][nc] = true;
          queue.push({ r: nr, c: nc });
        }
      }
    }
    return { wet, solved: wet[dest.r][dest.c] };
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  const boardEl = document.getElementById('board');
  const levelValueEl = document.getElementById('levelValue');
  const rotationsValueEl = document.getElementById('rotationsValue');
  const winToastEl = document.getElementById('winToast');
  const winSubtitleEl = document.getElementById('winSubtitle');
  const confettiEl = document.getElementById('confetti');

  const CONFETTI_COLORS = ['#44B4C4', '#EBDA61', '#2E292B'];

  let level = 1;
  let rotations = 0;
  let current = null;
  let cellEls = null; // 2D array: { el, visualEl }
  let locked = false;

  function renderBoard(state) {
    boardEl.innerHTML = '';
    boardEl.style.setProperty('--size', state.size);
    cellEls = Array.from({ length: state.size }, () => Array(state.size).fill(null));

    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const cellData = state.grid[r][c];
        const el = document.createElement('div');
        el.className = 'cell' + (((r + c) % 2) ? ' is-checker' : '');
        el.setAttribute('role', 'gridcell');

        if (cellData.type === 'source' || cellData.type === 'dest') {
          const isSource = cellData.type === 'source';
          const openIdx = isSource ? state.source.openIdx : state.dest.openIdx;
          const node = document.createElement('div');
          node.className = 'node ' + (isSource ? 'node--source' : 'node--dest');
          const stub = document.createElement('div');
          stub.className = `node__stub node__stub--${DIR_NAMES[openIdx]}`;
          const glyph = document.createElement('div');
          glyph.className = 'node__glyph';
          node.append(stub, glyph);
          el.appendChild(node);
          el.setAttribute('aria-label', isSource ? 'Spout' : 'Drain');
          cellEls[r][c] = { el, node };
        } else {
          el.classList.add('cell--pipe');
          el.setAttribute('aria-label', `${cellData.shape} pipe, tap to rotate`);
          const visual = document.createElement('div');
          visual.className = 'pipe-visual';
          visual.style.transform = `rotate(${cellData.rotation * 90}deg)`;

          const empty = document.createElement('img');
          empty.className = 'pipe-visual__empty';
          empty.src = ASSET(cellData.shape, false);
          empty.alt = '';
          empty.draggable = false;

          const flow = document.createElement('img');
          flow.className = 'pipe-visual__flow';
          flow.src = ASSET(cellData.shape, true);
          flow.alt = '';
          flow.draggable = false;

          visual.append(empty, flow);
          el.appendChild(visual);
          el.addEventListener('click', () => rotateCell(r, c));
          cellEls[r][c] = { el, visualEl: visual };
        }

        boardEl.appendChild(el);
      }
    }
  }

  function applyWetState(flow) {
    for (let r = 0; r < current.size; r++) {
      for (let c = 0; c < current.size; c++) {
        cellEls[r][c].el.classList.toggle('is-wet', flow.wet[r][c]);
      }
    }
  }

  function rotateCell(r, c) {
    if (locked) return;
    const cellData = current.grid[r][c];
    cellData.rotation = (cellData.rotation + 1) % 4;
    cellEls[r][c].visualEl.style.transform = `rotate(${cellData.rotation * 90}deg)`;

    rotations += 1;
    rotationsValueEl.textContent = String(rotations);

    const flow = computeFlow(current);
    applyWetState(flow);

    if (flow.solved) handleWin();
  }

  // --------------------------------------------------------------------------
  // Win state
  // --------------------------------------------------------------------------
  function spawnConfetti(originEl) {
    const rect = originEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 18; i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti__bit';
      const angle = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 90;
      bit.style.setProperty('--x', `${cx}px`);
      bit.style.setProperty('--y', `${cy}px`);
      bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      bit.style.setProperty('--dy', `${Math.sin(angle) * dist + 40}px`);
      bit.style.setProperty('--r0', `${Math.random() * 90 - 45}deg`);
      bit.style.setProperty('--r1', `${Math.random() * 360 - 180}deg`);
      bit.style.setProperty('--dur', `${700 + Math.random() * 500}ms`);
      bit.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      confettiEl.appendChild(bit);
      bit.addEventListener('animationend', () => bit.remove());
    }
  }

  function handleWin() {
    locked = true;

    const fullPath = [
      { r: current.source.r, c: current.source.c },
      ...current.path.slice(1, -1).map((p) => ({ r: p.r, c: p.c })),
      { r: current.dest.r, c: current.dest.c },
    ];
    fullPath.forEach((p, i) => {
      const target = cellEls[p.r][p.c];
      target.el.style.setProperty('--step', `${i * 70}ms`);
      target.el.classList.add('is-path');
    });

    spawnConfetti(cellEls[current.dest.r][current.dest.c].el);

    winSubtitleEl.textContent = `Level ${level} solved in ${rotations} turn${rotations === 1 ? '' : 's'}`;
    winToastEl.hidden = false;
    requestAnimationFrame(() => winToastEl.classList.add('is-visible'));

    levelValueEl.classList.add('is-bumped');
    levelValueEl.addEventListener('animationend', () => levelValueEl.classList.remove('is-bumped'), { once: true });

    setTimeout(() => {
      winToastEl.classList.remove('is-visible');
      setTimeout(() => { winToastEl.hidden = true; }, 260);
      nextLevel();
    }, 1500);
  }

  function nextLevel() {
    level += 1;
    levelValueEl.textContent = String(level);
    rotations = 0;
    rotationsValueEl.textContent = '0';
    current = generateLevel(level);
    renderBoard(current);
    applyWetState(computeFlow(current));
    locked = false;
  }

  // --------------------------------------------------------------------------
  // Mobile touch guards
  // The viewport meta tag and .board's touch-action:none handle most of
  // this, but iOS Safari doesn't reliably honor either for pinch and
  // double-tap zoom, so block those gestures explicitly.
  // --------------------------------------------------------------------------
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  boardEl.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault(); // pinch
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault(); // double-tap zoom
    lastTouchEnd = now;
  }, false);

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------
  function boot() {
    current = generateLevel(level);
    renderBoard(current);
    applyWetState(computeFlow(current));
  }

  boot();
})();

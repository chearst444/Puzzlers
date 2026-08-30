/* =========================================================================
   Puzzlers — Match-3 core game logic (vanilla JS, no dependencies)
   ========================================================================= */
(() => {
  "use strict";

  // ------------------------------- Config ---------------------------------
  const SIZE = 8;
  const SHAPES = ["pentagon", "diamond", "rectangle"];
  const COLORS = ["teal", "forest", "pink"];
  const START_MOVES = 30;
  const POINTS_PER_GEM = 10;
  const METER_PER_GEM = 7;
  const SWIPE_THRESHOLD_RATIO = 0.22; // fraction of a cell needed to register a swipe
  const BONUS_WORDS = ["SPARKLE", "BLOSSOM", "AURORA", "MINTY", "RADIANT", "LAGOON", "PETAL"];

  let bonusWordIndex = 0;

  // ------------------------------- State -----------------------------------
  /** board[row][col] = { id, shape, color } | null */
  let board = [];
  let score = 0;
  let moves = START_MOVES;
  let meter = 0;
  let busy = false;      // true while a resolve animation sequence is running
  let gameOver = false;
  let gemUid = 1;

  // ------------------------------ DOM refs ----------------------------------
  const boardEl = document.getElementById("board");
  const scoreValueEl = document.getElementById("scoreValue");
  const movesValueEl = document.getElementById("movesValue");
  const meterFillEl = document.getElementById("meterFill");
  const meterWordEl = document.getElementById("meterWord");
  const bannerEl = document.getElementById("banner");
  const cursorEl = document.getElementById("cursorSprite");

  // ------------------------------ Utilities ---------------------------------
  const rand = (n) => Math.floor(Math.random() * n);
  const randomType = () => ({ shape: SHAPES[rand(SHAPES.length)], color: COLORS[rand(COLORS.length)] });
  const sameType = (a, b) => !!a && !!b && a.shape === b.shape && a.color === b.color;
  const makeGem = (type) => ({ id: gemUid++, shape: type.shape, color: type.color });
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  function createEmptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  // Fill the board with random gems, rejecting any placement that would
  // create an immediate 3-in-a-row so the puzzle starts clean.
  function initBoard() {
    board = createEmptyBoard();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        let type;
        let tries = 0;
        do {
          type = randomType();
          tries++;
        } while (tries < 50 && (
          (c >= 2 && sameType(type, board[r][c - 1]) && sameType(type, board[r][c - 2])) ||
          (r >= 2 && sameType(type, board[r - 1][c]) && sameType(type, board[r - 2][c]))
        ));
        board[r][c] = makeGem(type);
      }
    }
    if (!hasAnyMove()) initBoard(); // guarantee a playable start
  }

  // --------------------------------- Render ----------------------------------
  const cellEls = [];   // flat array of .cell elements, row-major
  const gemEls = new Map(); // gem.id -> .gem element

  function buildGrid() {
    boardEl.innerHTML = "";
    cellEls.length = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
        boardEl.appendChild(cell);
        cellEls.push(cell);
      }
    }
  }

  function cellAt(r, c) { return cellEls[r * SIZE + c]; }

  function createGemEl(gem, r, c) {
    const el = document.createElement("div");
    el.className = "gem";
    el.dataset.shape = gem.shape;
    el.dataset.color = gem.color;
    el.dataset.gemId = gem.id;
    el.dataset.row = r;
    el.dataset.col = c;
    const art = document.createElement("div");
    art.className = "gem__art";
    el.appendChild(art);
    attachGemInput(el);
    return el;
  }

  // Render the full board fresh. `fallInfo` maps "r,c" -> rows-fallen, used
  // to animate refilled/settled gems dropping into place.
  function renderBoard(fallInfo) {
    gemEls.forEach((el) => el.remove());
    gemEls.clear();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const gem = board[r][c];
        if (!gem) continue;
        const el = createGemEl(gem, r, c);
        const cell = cellAt(r, c);
        const key = `${r},${c}`;
        const fall = fallInfo && fallInfo.get(key);
        if (fall) {
          el.style.transform = `translateY(${-fall * 100}%)`;
        }
        cell.appendChild(el);
        gemEls.set(gem.id, el);
        if (fall) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.classList.add("is-falling");
            el.style.transform = "";
          }));
        }
      }
    }
  }

  // ------------------------------ Match detection -----------------------------
  function findMatches() {
    const matched = new Set(); // "r,c"
    // horizontal
    for (let r = 0; r < SIZE; r++) {
      let runStart = 0;
      for (let c = 1; c <= SIZE; c++) {
        const cur = c < SIZE ? board[r][c] : null;
        const prev = board[r][c - 1];
        if (!cur || !prev || !sameType(cur, prev)) {
          if (c - runStart >= 3) {
            for (let k = runStart; k < c; k++) matched.add(`${r},${k}`);
          }
          runStart = c;
        }
      }
    }
    // vertical
    for (let c = 0; c < SIZE; c++) {
      let runStart = 0;
      for (let r = 1; r <= SIZE; r++) {
        const cur = r < SIZE ? board[r][c] : null;
        const prev = board[r - 1][c];
        if (!cur || !prev || !sameType(cur, prev)) {
          if (r - runStart >= 3) {
            for (let k = runStart; k < r; k++) matched.add(`${k},${c}`);
          }
          runStart = r;
        }
      }
    }
    return matched;
  }

  function wouldMatchAt(testBoard, r, c) {
    const gem = testBoard[r][c];
    if (!gem) return false;
    // horizontal
    let run = 1;
    for (let cc = c - 1; cc >= 0 && sameType(testBoard[r][cc], gem); cc--) run++;
    for (let cc = c + 1; cc < SIZE && sameType(testBoard[r][cc], gem); cc++) run++;
    if (run >= 3) return true;
    // vertical
    run = 1;
    for (let rr = r - 1; rr >= 0 && sameType(testBoard[rr][c], gem); rr--) run++;
    for (let rr = r + 1; rr < SIZE && sameType(testBoard[rr][c], gem); rr++) run++;
    return run >= 3;
  }

  function hasAnyMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c < SIZE - 1) {
          swapCells(board, r, c, r, c + 1);
          const ok = wouldMatchAt(board, r, c) || wouldMatchAt(board, r, c + 1);
          swapCells(board, r, c, r, c + 1);
          if (ok) return true;
        }
        if (r < SIZE - 1) {
          swapCells(board, r, c, r + 1, c);
          const ok = wouldMatchAt(board, r, c) || wouldMatchAt(board, r + 1, c);
          swapCells(board, r, c, r + 1, c);
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function swapCells(b, r1, c1, r2, c2) {
    const tmp = b[r1][c1];
    b[r1][c1] = b[r2][c2];
    b[r2][c2] = tmp;
  }

  // --------------------------------- Gravity ----------------------------------
  function collapseAndRefill(matchedKeys) {
    const fallInfo = new Map();
    for (const key of matchedKeys) {
      const [r, c] = key.split(",").map(Number);
      board[r][c] = null;
    }
    for (let c = 0; c < SIZE; c++) {
      const survivors = [];
      for (let r = 0; r < SIZE; r++) {
        if (board[r][c]) survivors.push({ gem: board[r][c], oldRow: r });
      }
      const empty = SIZE - survivors.length;
      const col = Array(SIZE).fill(null);
      for (let i = 0; i < empty; i++) {
        col[i] = makeGem(randomType());
        fallInfo.set(`${i},${c}`, i + 1); // spawn just above the board, cascade in
      }
      for (let i = 0; i < survivors.length; i++) {
        const newRow = empty + i;
        col[newRow] = survivors[i].gem;
        const dist = newRow - survivors[i].oldRow;
        if (dist > 0) fallInfo.set(`${newRow},${c}`, dist);
      }
      for (let r = 0; r < SIZE; r++) board[r][c] = col[r];
    }
    return fallInfo;
  }

  // ---------------------------------- Scoring ----------------------------------
  function updateHud() {
    scoreValueEl.textContent = score.toLocaleString();
    movesValueEl.textContent = String(Math.max(0, moves));
    meterFillEl.style.width = `${Math.min(100, meter)}%`;
  }

  function showBanner(text, isBonus) {
    bannerEl.textContent = text;
    bannerEl.classList.toggle("is-bonus", !!isBonus);
    bannerEl.hidden = false;
    bannerEl.style.animation = "none";
    // restart the pop animation
    void bannerEl.offsetWidth;
    bannerEl.style.animation = "";
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => { bannerEl.hidden = true; }, 1800);
  }

  // Adds to the power meter; returns true the moment it fills so the caller
  // can fold a bonus board-clear into the pass currently resolving.
  function addPower(amount) {
    meter += amount;
    if (meter >= 100) {
      meter -= 100;
      updateHud();
      return true;
    }
    updateHud();
    return false;
  }

  // A "board-clearing obstacle": wipe a random full row and a random full
  // column, unlocking the next bonus word in the power panel.
  function triggerBonus() {
    const word = BONUS_WORDS[bonusWordIndex % BONUS_WORDS.length];
    bonusWordIndex++;
    meterWordEl.textContent = word;
    meterWordEl.classList.add("is-visible");
    setTimeout(() => meterWordEl.classList.remove("is-visible"), 2200);
    showBanner(`Power surge! "${word}" unlocked`, true);

    const wipeRow = rand(SIZE);
    const wipeCol = rand(SIZE);
    const keys = new Set();
    for (let c = 0; c < SIZE; c++) keys.add(`${wipeRow},${c}`);
    for (let r = 0; r < SIZE; r++) keys.add(`${r},${wipeCol}`);
    score += keys.size * POINTS_PER_GEM * 2;
    return keys;
  }

  // ------------------------------- Resolve loop ---------------------------------
  async function resolveBoard(initialMatches, comboStart) {
    let matched = initialMatches;
    let combo = comboStart || 1;
    while (matched && matched.size > 0) {
      const markMatched = (key) => {
        const [r, c] = key.split(",").map(Number);
        const el = gemEls.get(board[r][c] && board[r][c].id);
        if (el) el.classList.add("is-matched");
      };
      matched.forEach(markMatched);
      score += matched.size * POINTS_PER_GEM * combo;

      const clearKeys = new Set(matched);
      if (addPower(matched.size * METER_PER_GEM)) {
        const bonusKeys = triggerBonus();
        bonusKeys.forEach((k) => { if (!clearKeys.has(k)) markMatched(k); clearKeys.add(k); });
      }
      updateHud();
      await wait(240);

      const fallInfo = collapseAndRefill(clearKeys);
      renderBoard(fallInfo);
      await wait(300);

      matched = findMatches();
      combo++;
    }
    if (combo > 2) showBanner(`Combo x${combo - 1}!`, false);
  }

  function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

  // -------------------------------- Interaction ---------------------------------
  let selected = null;     // {r,c,el}
  let dragStart = null;    // {r,c,x,y,pointerId}
  let suppressClick = false; // set when pointerup already resolved a swipe, so the
                              // browser's trailing synthetic "click" is a no-op

  function clearSelection() {
    if (selected) selected.el.classList.remove("is-selected");
    selected = null;
  }

  function selectGem(r, c, el) {
    clearSelection();
    selected = { r, c, el };
    el.classList.add("is-selected");
  }

  async function attemptSwap(r1, c1, r2, c2) {
    if (busy || gameOver) return;
    if (!inBounds(r2, c2)) return;
    const gem1 = board[r1][c1], gem2 = board[r2][c2];
    if (!gem1 || !gem2) return;
    busy = true;

    // Slide the two real elements toward each other first, purely visual —
    // the model swap happens once the slide has landed.
    const el1 = gemEls.get(gem1.id), el2 = gemEls.get(gem2.id);
    const cellPx = boardEl.getBoundingClientRect().width / SIZE;
    const dx = (c2 - c1) * cellPx, dy = (r2 - r1) * cellPx;
    if (el1) { el1.classList.add("is-falling"); el1.style.transform = `translate(${dx}px, ${dy}px)`; }
    if (el2) { el2.classList.add("is-falling"); el2.style.transform = `translate(${-dx}px, ${-dy}px)`; }
    await wait(220);

    swapCells(board, r1, c1, r2, c2);
    const matches = findMatches();
    if (matches.size === 0) {
      // no match — slide back to where they started
      if (el1) el1.style.transform = "";
      if (el2) el2.style.transform = "";
      await wait(220);
      if (el1) { el1.classList.remove("is-falling"); el1.classList.add("is-invalid-swap"); setTimeout(() => el1.classList.remove("is-invalid-swap"), 300); }
      if (el2) el2.classList.remove("is-falling");
      busy = false;
      return;
    }
    moves = Math.max(0, moves - 1);
    renderBoard(null); // elements land exactly where the slide already placed them, no jump
    await resolveBoard(matches, 1);
    updateHud();
    busy = false;
    if (moves <= 0) endGame();
    else if (!hasAnyMove()) reshuffleBoard();
  }

  function reshuffleBoard() {
    showBanner("No moves left — reshuffling", false);
    initBoard();
    renderBoard(null);
  }

  function endGame() {
    gameOver = true;
    showBanner(`Game Over — Final Score ${score.toLocaleString()}`, true);
  }

  function attachGemInput(el) {
    el.addEventListener("pointerdown", onGemPointerDown);
    el.addEventListener("click", onGemClick);
  }

  function onGemClick(e) {
    if (suppressClick) { suppressClick = false; return; }
    if (busy || gameOver) return;
    const r = Number(e.currentTarget.dataset.row);
    const c = Number(e.currentTarget.dataset.col);
    if (!selected) { selectGem(r, c, e.currentTarget); return; }
    const dr = Math.abs(selected.r - r), dc = Math.abs(selected.c - c);
    if (selected.r === r && selected.c === c) { clearSelection(); return; }
    if (dr + dc === 1) {
      const { r: sr, c: sc } = selected;
      clearSelection();
      attemptSwap(sr, sc, r, c);
    } else {
      selectGem(r, c, e.currentTarget);
    }
  }

  function onGemPointerDown(e) {
    if (busy || gameOver) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragStart = {
      r: Number(el.dataset.row), c: Number(el.dataset.col),
      x: e.clientX, y: e.clientY, pointerId: e.pointerId,
    };
    cursorEl.classList.add("is-dragging");
    el.addEventListener("pointermove", onGemPointerMove);
    el.addEventListener("pointerup", onGemPointerUp);
    el.addEventListener("pointercancel", onGemPointerUp);
  }

  function onGemPointerMove(e) {
    if (!dragStart || e.pointerId !== dragStart.pointerId) return;
    // Prevent the browser from treating this as a scroll/selection gesture.
    e.preventDefault();
  }

  function onGemPointerUp(e) {
    const el = e.currentTarget;
    el.removeEventListener("pointermove", onGemPointerMove);
    el.removeEventListener("pointerup", onGemPointerUp);
    el.removeEventListener("pointercancel", onGemPointerUp);
    cursorEl.classList.remove("is-dragging");
    if (!dragStart || e.pointerId !== dragStart.pointerId) { dragStart = null; return; }

    const cellPx = boardEl.getBoundingClientRect().width / SIZE;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const threshold = cellPx * SWIPE_THRESHOLD_RATIO;
    const { r, c } = dragStart;
    dragStart = null;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // Barely moved — this is a tap. Let the browser's own trailing "click"
      // event drive tap-to-select, rather than acting twice on one gesture.
      return;
    }
    suppressClick = true;
    let dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? { dr: 0, dc: 1 } : { dr: 0, dc: -1 };
    else dir = dy > 0 ? { dr: 1, dc: 0 } : { dr: -1, dc: 0 };
    clearSelection();
    attemptSwap(r, c, r + dir.dr, c + dir.dc);
  }

  // ------------------------------ Touch/zoom lockdown ------------------------------
  function lockViewportGestures() {
    // Belt-and-braces alongside the pointer-events handlers above: explicitly
    // stop touchmove from scrolling/rubber-banding the page while dragging on
    // the board, and stop iOS Safari's double-tap-to-zoom on gems.
    boardEl.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    boardEl.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) e.preventDefault(); // block pinch-zoom
    }, { passive: false });
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    let lastTouchEnd = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ------------------------------- Cursor follower ---------------------------------
  function initCursorFollower() {
    window.addEventListener("pointermove", (e) => {
      cursorEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });
    window.addEventListener("pointerleave", () => { cursorEl.style.opacity = "0"; });
    window.addEventListener("pointerenter", () => { cursorEl.style.opacity = "1"; });
  }

  // ------------------------------ Responsive gem scale ------------------------------
  // .gem__art is a fixed native-pixel box per shape (see CSS) so the sprite
  // mask crop stays pixel-accurate; here we drive its visual size with a
  // plain unitless transform:scale, recomputed whenever the board's actual
  // rendered size changes (orientation change, resize, devtools, etc).
  const GEM_BASE_PX = 64; // matches the widest native shape (the rectangle)
  function syncGemScale() {
    const cellPx = boardEl.getBoundingClientRect().width / SIZE;
    if (cellPx > 0) {
      boardEl.style.setProperty("--gem-scale", String(cellPx / GEM_BASE_PX));
    }
  }

  // ---------------------------------- Boot -----------------------------------------
  function start() {
    initBoard();
    buildGrid();
    renderBoard(null);
    updateHud();
    lockViewportGestures();
    initCursorFollower();
    syncGemScale();
    if (window.ResizeObserver) {
      new ResizeObserver(syncGemScale).observe(boardEl);
    } else {
      window.addEventListener("resize", syncGemScale);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();

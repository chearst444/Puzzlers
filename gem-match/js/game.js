"use strict";

/* ===========================================================
   Bracket Racket — standard match-3
   Handmade gem art (assets/handmade/) instead of generated SVG shapes.
   Deliberately a different set of hand-drawn shapes than the Match-3
   game (which uses pentagon/diamond/rectangle/circle/square/heart/star) -
   this one draws on the sprite sheet's bracket/tile marks instead, so
   the two games don't look like reskins of each other. Matching is
   still purely by color (see color.id below); shape is a cosmetic layer
   on top, cycling the three real shapes drawn in that color.
   =========================================================== */

const ROWS = 8;
const COLS = 8;
const GAP = 6;
const PAD = 10;
const SWAP_MS = 220;
const CLEAR_MS = 220;
const FALL_MS = 220;

// Each color's shape roster is exactly the shapes actually drawn in that
// color - a real crop of assets/handmade/gem-<shape>-<id>.png, not a full
// shape x color cross product.
const COLORS = [
  { id: "pink",   shapes: ["tab", "bracketl", "bracketr"] },
  { id: "teal",   shapes: ["tab", "bracketl", "bracketr"] },
  { id: "purple", shapes: ["tab", "bracketl", "bracketr"] },
  { id: "cream",  shapes: ["tab", "bracketl", "bracketr"] },
];

/* ---------- state ---------- */
const boardEl = document.getElementById("board");
const scoreValueEl = document.getElementById("scoreValue");
const bestValueEl = document.getElementById("bestValue");
const boardMessageEl = document.getElementById("boardMessage");
const newGameBtn = document.getElementById("newGameBtn");

let board = [];        // board[row][col] = { uid, color, shape, el } | null
let cellSize = 56;
let uidSeq = 1;
let score = 0;
let best = Number(localStorage.getItem("gemMatchBest") || 0);
let busy = false;
let selected = null;   // {row, col}
let pointer = null;    // active drag tracking

bestValueEl.textContent = best;

/* ---------- layout ---------- */
function computeCellSize() {
  // Measure the real HUD/footer/app-padding heights (rather than a fixed
  // offset) so the board fits without clipping in any orientation,
  // including short phone-landscape viewports.
  const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const viewportW = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
  const hudEl = document.querySelector(".hud");
  const footEl = document.querySelector(".foot");
  const appEl = document.getElementById("app");
  const appStyle = getComputedStyle(appEl);
  const vPad = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
  const gap = (parseFloat(appStyle.rowGap || appStyle.gap) || 18) * 2;
  const hudH = hudEl ? hudEl.getBoundingClientRect().height : 60;
  const footH = footEl ? footEl.getBoundingClientRect().height : 24;

  const maxW = Math.min(viewportW - 24, 560);
  const maxH = viewportH - vPad - gap - hudH - footH - 12;
  const available = Math.max(130, Math.min(maxW, maxH));
  const size = Math.floor((available - PAD * 2 - GAP * (COLS - 1)) / COLS);
  return Math.max(18, Math.min(68, size));
}

function pos(row, col) {
  return {
    left: PAD + col * (cellSize + GAP),
    top: PAD + row * (cellSize + GAP),
  };
}

function layoutBoard() {
  cellSize = computeCellSize();
  const w = PAD * 2 + COLS * cellSize + (COLS - 1) * GAP;
  const h = PAD * 2 + ROWS * cellSize + (ROWS - 1) * GAP;
  boardEl.style.width = w + "px";
  boardEl.style.height = h + "px";
  boardEl.style.setProperty("--cell-size", cellSize + "px");

  // grid line cells
  boardEl.querySelectorAll(".cell").forEach((el) => el.remove());
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const p = pos(r, c);
      cell.style.left = p.left + "px";
      cell.style.top = p.top + "px";
      cell.style.width = cellSize + "px";
      cell.style.height = cellSize + "px";
      boardEl.appendChild(cell);
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const gem = board[r] && board[r][c];
      if (gem && gem.el) placeGemEl(gem, r, c, false);
    }
  }
}

/* ---------- gem factory ---------- */
function randomShapeFor(color) {
  const shapes = color.shapes;
  return shapes[(Math.random() * shapes.length) | 0];
}
function randomGem() {
  const color = COLORS[(Math.random() * COLORS.length) | 0];
  const shape = randomShapeFor(color);
  return { uid: uidSeq++, color, shape, el: null };
}

function createGemEl(gem, row, col) {
  const el = document.createElement("div");
  el.className = "gem";
  const art = document.createElement("div");
  art.className = "gem__art";
  art.style.backgroundImage = `url("assets/handmade/gem-${gem.shape}-${gem.color.id}.png")`;
  el.appendChild(art);
  el.dataset.uid = gem.uid;
  const p = pos(row, col);
  el.style.left = p.left + "px";
  el.style.top = p.top + "px";
  el.style.width = cellSize + "px";
  el.style.height = cellSize + "px";
  el.addEventListener("pointerdown", onPointerDown);
  boardEl.appendChild(el);
  gem.el = el;
}

function placeGemEl(gem, row, col, animate = true) {
  const p = pos(row, col);
  if (!animate) {
    const prevTransition = gem.el.style.transition;
    gem.el.style.transition = "none";
    gem.el.style.left = p.left + "px";
    gem.el.style.top = p.top + "px";
    // force reflow then restore transition
    void gem.el.offsetHeight;
    gem.el.style.transition = prevTransition;
  } else {
    gem.el.style.left = p.left + "px";
    gem.el.style.top = p.top + "px";
  }
}

/* ---------- board generation ---------- */
function makeInitialBoard() {
  let attempts = 0;
  do {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const forbidden = new Set();
        if (c >= 2 && row[c - 1].color === row[c - 2].color) forbidden.add(row[c - 1].color.id);
        if (r >= 2 && board[r - 1][c].color === board[r - 2][c].color) forbidden.add(board[r - 1][c].color.id);
        let color;
        do {
          color = COLORS[(Math.random() * COLORS.length) | 0];
        } while (forbidden.has(color.id));
        const shape = randomShapeFor(color);
        row.push({ uid: uidSeq++, color, shape, el: null });
      }
      board.push(row);
    }
    attempts++;
  } while (!hasPossibleMove() && attempts < 50);
}

function renderInitialBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      createGemEl(board[r][c], r, c);
    }
  }
}

/* ---------- match detection ---------- */
function findMatchedGroups() {
  const groups = [];
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    let runStart = 0;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && board[r][c] && board[r][runStart] &&
        board[r][c].color.id === board[r][runStart].color.id;
      if (!same) {
        if (c - runStart >= 3) {
          const cells = [];
          for (let k = runStart; k < c; k++) cells.push({ row: r, col: k });
          groups.push(cells);
        }
        runStart = c;
      }
    }
  }
  // vertical
  for (let c = 0; c < COLS; c++) {
    let runStart = 0;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && board[r][c] && board[runStart][c] &&
        board[r][c].color.id === board[runStart][c].color.id;
      if (!same) {
        if (r - runStart >= 3) {
          const cells = [];
          for (let k = runStart; k < r; k++) cells.push({ row: k, col: c });
          groups.push(cells);
        }
        runStart = r;
      }
    }
  }
  return groups;
}

function wouldMatchAt(r, c) {
  const gem = board[r][c];
  if (!gem) return false;
  const id = gem.color.id;
  // horizontal
  let run = 1;
  for (let k = c - 1; k >= 0 && board[r][k] && board[r][k].color.id === id; k--) run++;
  for (let k = c + 1; k < COLS && board[r][k] && board[r][k].color.id === id; k++) run++;
  if (run >= 3) return true;
  // vertical
  run = 1;
  for (let k = r - 1; k >= 0 && board[k][c] && board[k][c].color.id === id; k--) run++;
  for (let k = r + 1; k < ROWS && board[k][c] && board[k][c].color.id === id; k++) run++;
  return run >= 3;
}

function hasPossibleMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c < COLS - 1) {
        swapCells(r, c, r, c + 1);
        const ok = wouldMatchAt(r, c) || wouldMatchAt(r, c + 1);
        swapCells(r, c, r, c + 1);
        if (ok) return true;
      }
      if (r < ROWS - 1) {
        swapCells(r, c, r + 1, c);
        const ok = wouldMatchAt(r, c) || wouldMatchAt(r + 1, c);
        swapCells(r, c, r + 1, c);
        if (ok) return true;
      }
    }
  }
  return false;
}

function swapCells(r1, c1, r2, c2) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
}

/* ---------- gameplay flow ---------- */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptSwap(r1, c1, r2, c2) {
  if (busy) return;
  busy = true;
  clearSelection();

  swapCells(r1, c1, r2, c2);
  placeGemEl(board[r1][c1], r1, c1);
  placeGemEl(board[r2][c2], r2, c2);
  await wait(SWAP_MS);

  const groups = findMatchedGroups();
  if (groups.length === 0) {
    // invalid move: swap back
    board[r1][c1].el.classList.add("is-invalid");
    board[r2][c2].el.classList.add("is-invalid");
    swapCells(r1, c1, r2, c2);
    placeGemEl(board[r1][c1], r1, c1);
    placeGemEl(board[r2][c2], r2, c2);
    await wait(SWAP_MS);
    board[r1][c1].el.classList.remove("is-invalid");
    board[r2][c2].el.classList.remove("is-invalid");
    busy = false;
    return;
  }

  await resolveCascades(1);

  if (!hasPossibleMove()) {
    await reshuffleBoard();
  }
  busy = false;
}

async function resolveCascades(chain) {
  const groups = findMatchedGroups();
  if (groups.length === 0) return;

  const uniqueCells = new Map();
  for (const group of groups) {
    for (const cell of group) uniqueCells.set(cell.row + "," + cell.col, cell);
  }
  addScore(groupsTotalScore(groups, chain));
  showComboMessage(chain);

  for (const { row, col } of uniqueCells.values()) {
    const gem = board[row][col];
    if (gem && gem.el) gem.el.classList.add("is-matched");
  }
  await wait(CLEAR_MS);
  for (const { row, col } of uniqueCells.values()) {
    const gem = board[row][col];
    if (gem && gem.el) gem.el.remove();
    board[row][col] = null;
  }

  applyGravityAndRefill();
  await wait(FALL_MS);

  await resolveCascades(chain + 1);
}

function groupScore(len) {
  if (len >= 5) return 100;
  if (len === 4) return 60;
  return 30;
}

function groupsTotalScore(groups, chain) {
  let total = 0;
  for (const g of groups) total += groupScore(g.length);
  return total * chain;
}

function addScore(points) {
  score += points;
  scoreValueEl.textContent = score;
  if (score > best) {
    best = score;
    bestValueEl.textContent = best;
    localStorage.setItem("gemMatchBest", String(best));
  }
}

function showComboMessage(chain) {
  if (chain < 2) return;
  flashBoardMessage(`Combo x${chain}!`, 500);
}

let messageTimer = null;
function flashBoardMessage(text, duration) {
  clearTimeout(messageTimer);
  boardMessageEl.textContent = text;
  boardMessageEl.hidden = false;
  boardMessageEl.style.background = "rgba(232,196,222,0.0)";
  boardMessageEl.style.border = "none";
  boardMessageEl.style.boxShadow = "none";
  boardMessageEl.style.pointerEvents = "none";
  messageTimer = setTimeout(() => {
    boardMessageEl.hidden = true;
  }, duration);
}

function applyGravityAndRefill() {
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        if (writeRow !== r) {
          board[writeRow][c] = board[r][c];
          board[r][c] = null;
          placeGemEl(board[writeRow][c], writeRow, c);
        }
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) {
      const gem = randomGem();
      board[r][c] = gem;
      createGemEl(gem, -1 - (writeRow - r), c);
      gem.el.classList.add("is-spawning");
      requestAnimationFrame(() => {
        gem.el.classList.remove("is-spawning");
        placeGemEl(gem, r, c);
      });
    }
  }
}

async function reshuffleBoard() {
  flashBoardMessage("Reshuffling…", 900);
  const gems = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) gems.push(board[r][c]);
  let attempts = 0;
  do {
    for (let i = gems.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    let k = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = gems[k++];
    attempts++;
  } while ((findMatchedGroups().length > 0 || !hasPossibleMove()) && attempts < 200);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      placeGemEl(board[r][c], r, c);
    }
  }
  await wait(FALL_MS);
}

/* ---------- selection & input ---------- */
function clearSelection() {
  if (selected) {
    const gem = board[selected.row][selected.col];
    if (gem && gem.el) gem.el.classList.remove("is-selected");
  }
  selected = null;
}

function isAdjacent(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr + dc) === 1;
}

function selectGem(row, col) {
  if (selected && selected.row === row && selected.col === col) {
    clearSelection();
    return;
  }
  if (selected && isAdjacent(selected, { row, col })) {
    const from = selected;
    clearSelection();
    attemptSwap(from.row, from.col, row, col);
    return;
  }
  clearSelection();
  selected = { row, col };
  const gem = board[row][col];
  if (gem && gem.el) gem.el.classList.add("is-selected");
}

function findGemCoords(uid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].uid === uid) return { row: r, col: c };
    }
  }
  return null;
}

function onPointerDown(e) {
  if (busy) return;
  e.preventDefault();
  const uid = Number(e.currentTarget.dataset.uid);
  const coords = findGemCoords(uid);
  if (!coords) return;
  pointer = { startX: e.clientX, startY: e.clientY, coords, moved: false };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e) {
  if (!pointer || pointer.moved || busy) return;
  const dx = e.clientX - pointer.startX;
  const dy = e.clientY - pointer.startY;
  const threshold = cellSize * 0.32;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

  pointer.moved = true;
  const { row, col } = pointer.coords;
  let target = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    target = dx > 0 ? { row, col: col + 1 } : { row, col: col - 1 };
  } else {
    target = dy > 0 ? { row: row + 1, col } : { row: row - 1, col };
  }
  if (target.row >= 0 && target.row < ROWS && target.col >= 0 && target.col < COLS) {
    clearSelection();
    attemptSwap(row, col, target.row, target.col);
  }
  endPointerTracking();
}

function onPointerUp(e) {
  const isCancel = e && e.type === "pointercancel";
  if (pointer && !pointer.moved && !isCancel) {
    selectGem(pointer.coords.row, pointer.coords.col);
  }
  endPointerTracking();
}

function endPointerTracking() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  pointer = null;
}

/* ---------- new game ---------- */
function newGame() {
  boardEl.querySelectorAll(".gem").forEach((el) => el.remove());
  score = 0;
  scoreValueEl.textContent = "0";
  selected = null;
  boardMessageEl.hidden = true;
  makeInitialBoard();
  layoutBoard();
  renderInitialBoard();
}

newGameBtn.addEventListener("click", newGame);
window.addEventListener("resize", layoutBoard);
window.addEventListener("orientationchange", layoutBoard);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", layoutBoard);
}

/* ---------- mobile guards: block pinch-zoom, long-press callout, drag-ghosting ---------- */
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dragstart", (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault(); // stop iOS double-tap-to-zoom
  lastTouchEnd = now;
}, { passive: false });

newGame();

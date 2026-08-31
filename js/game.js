"use strict";

/* ===========================================================
   Gem Match — standard match-3
   Kenney-style gem / diamond / heart shapes, 5-color palette.
   =========================================================== */

const ROWS = 8;
const COLS = 8;
const GAP = 6;
const PAD = 10;
const SWAP_MS = 220;
const CLEAR_MS = 220;
const FALL_MS = 220;

const COLORS = [
  { id: "tomato",   hex: "#E9453A" },
  { id: "squash",   hex: "#F3814D" },
  { id: "marigold", hex: "#EBDA61" },
  { id: "teal",     hex: "#44B4C4" },
  { id: "olive",    hex: "#BFA749" },
];
const SHAPES = ["gem", "diamond", "heart"];
const INK = "#2E292B";

/* ---------- SVG shape templates (Kenney flat-icon style) ---------- */
function shapeMarkup(shape, hex) {
  const stroke = `stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"`;
  let body = "";
  let gloss = "";
  if (shape === "gem") {
    body = `<polygon points="50,6 83,29 92,56 50,96 8,56 17,29" fill="${hex}" ${stroke}/>`;
    gloss = `<polygon points="50,6 83,29 60,34 40,20" fill="#ffffff" opacity="0.35"/>`;
  } else if (shape === "diamond") {
    body = `<polygon points="50,4 93,50 50,96 7,50" fill="${hex}" ${stroke}/>`;
    gloss = `<polygon points="50,4 93,50 65,50 42,18" fill="#ffffff" opacity="0.35"/>`;
  } else {
    body = `<path d="M50,90 C12,63 4,34 23,19 C37,8 50,19 50,33 C50,19 63,8 77,19 C96,34 88,63 50,90 Z" fill="${hex}" ${stroke}/>`;
    gloss = `<ellipse cx="30" cy="30" rx="9" ry="6" fill="#ffffff" opacity="0.4" transform="rotate(-30 30 30)"/>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}${gloss}</svg>`;
}

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
  const maxW = Math.min(window.innerWidth - 32, 560);
  const maxH = window.innerHeight - 230;
  const available = Math.max(200, Math.min(maxW, maxH));
  const size = Math.floor((available - PAD * 2 - GAP * (COLS - 1)) / COLS);
  return Math.max(26, Math.min(68, size));
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
function randomGem() {
  const color = COLORS[(Math.random() * COLORS.length) | 0];
  const shape = SHAPES[(Math.random() * SHAPES.length) | 0];
  return { uid: uidSeq++, color, shape, el: null };
}

function createGemEl(gem, row, col) {
  const el = document.createElement("div");
  el.className = "gem";
  el.innerHTML = shapeMarkup(gem.shape, gem.color.hex);
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
        const shape = SHAPES[(Math.random() * SHAPES.length) | 0];
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
  const uid = Number(e.currentTarget.dataset.uid);
  const coords = findGemCoords(uid);
  if (!coords) return;
  pointer = { startX: e.clientX, startY: e.clientY, coords, moved: false };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
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

function onPointerUp() {
  if (pointer && !pointer.moved) {
    selectGem(pointer.coords.row, pointer.coords.col);
  }
  endPointerTracking();
}

function endPointerTracking() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
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

newGame();

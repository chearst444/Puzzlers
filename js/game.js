/* =========================================================================
   Puzzlers — Match-3 core game logic (vanilla JS, no dependencies)
   ========================================================================= */
(() => {
  "use strict";

  // ------------------------------- Config ---------------------------------
  const SIZE = 8;
  // Every gem type that can spawn, as an explicit (shape, color) list rather
  // than a shape x color cross product - each is a real hand-drawn crop
  // (assets/handmade/) and not every shape was drawn in every color, so the
  // roster is exactly the combos that actually have art. Uses every clean
  // "blob" shape across both sprite sheets - pentagon/diamond/rectangle in
  // the game's teal/forest/pink trio, plus circle/square/heart/star each in
  // one accent color - while leaving out the sheets' thinner glyph marks
  // (brackets, asterisk, caret, hash, slash) that don't read as filled game
  // pieces at gem size. Kept at 13 types total (same as before this pass)
  // so match odds on an 8x8 board don't get so thin the game stops feeling
  // fair - more shapes here traded for fewer colors per shape, not a net
  // pile-on.
  const GEM_TYPES = [
    { shape: "pentagon", color: "teal" }, { shape: "pentagon", color: "forest" }, { shape: "pentagon", color: "pink" },
    { shape: "diamond", color: "teal" }, { shape: "diamond", color: "forest" }, { shape: "diamond", color: "pink" },
    { shape: "rectangle", color: "teal" }, { shape: "rectangle", color: "forest" }, { shape: "rectangle", color: "pink" },
    { shape: "circle", color: "yellow" },
    { shape: "square", color: "navy" },
    { shape: "heart", color: "orange" },
    { shape: "star", color: "purple" },
  ];
  const POINTS_PER_GEM = 10;
  const METER_PER_GEM = 7;
  const SWIPE_THRESHOLD_RATIO = 0.22; // fraction of a cell needed to register a swipe
  const BONUS_WORDS = ["SPARKLE", "BLOSSOM", "AURORA", "MINTY", "RADIANT", "LAGOON", "PETAL"];

  const MAX_HEARTS = 3;

  // Progressive time-attack tiers: each gets tougher — more matches, less time.
  const TIERS = [
    { label: "TIER 1", quota: 10, seconds: 60 },
    { label: "TIER 2", quota: 12, seconds: 45 },
    { label: "TIER 3", quota: 15, seconds: 30 },
  ];

  // Frenzy: every 5 consecutive successful swaps speeds animations up and
  // boosts scoring for a few seconds.
  const FRENZY_STREAK_STEP = 5;
  const FRENZY_DURATION_MS = 8000;
  const FRENZY_SCORE_MULT = 1.5;
  const FRENZY_SPEED_MULT = 0.55; // multiplies animation durations (<1 = faster)

  // Base animation durations in ms — also mirrored onto the CSS custom
  // properties --dur-motion / --dur-clear so JS waits and CSS transitions
  // always agree, in or out of Frenzy.
  const ANIM = { swapMs: 220, clearMs: 260, fallMs: 300 };

  // Match-mode cycle: every 20 matches in the current mode, an interstitial
  // screen holds for 5 seconds and announces the switch to the other mode.
  const MODE_SWITCH_THRESHOLD = 20;
  const MODE_SCREEN_MS = 5000;

  // Reward for a genuine "good move" bonus (a cascade combo, a power surge,
  // or hitting a Frenzy streak) — a few extra seconds on the tier clock.
  const TIME_BONUS_SECONDS = 5;

  let bonusWordIndex = 0;

  // ------------------------------- State -----------------------------------
  /** board[row][col] = { id, shape, color } | null */
  let board = [];
  let score = 0;
  let meter = 0;
  let busy = false;      // true while a resolve animation sequence is running
  let gameOver = false;
  let gemUid = 1;

  let hearts = MAX_HEARTS;
  let tierIndex = 0;
  let round = 1;
  let matchesThisTier = 0;
  let timeLeft = TIERS[0].seconds;
  let timerInterval = null;

  let matchStreak = 0;
  let frenzyActive = false;
  let frenzyTimeout = null;

  let matchMode = "orthogonal"; // "orthogonal" (rows+columns) | "diagonal"
  let modeMatchCount = 0;
  let pendingModeSwitch = false;

  // ------------------------------ DOM refs ----------------------------------
  const boardEl = document.getElementById("board");
  const scoreValueEl = document.getElementById("scoreValue");
  const meterFillEl = document.getElementById("meterFill");
  const meterWordEl = document.getElementById("meterWord");
  const bannerEl = document.getElementById("banner");
  const cursorEl = document.getElementById("cursorSprite");
  const heartsRowEl = document.getElementById("heartsRow");
  const timerValueEl = document.getElementById("timerValue");
  const tierLabelEl = document.getElementById("tierLabel");
  const tierProgressEl = document.getElementById("tierProgress");
  const hudEl = document.getElementById("hud");
  const frenzyTagEl = document.getElementById("frenzyTag");
  const countdownOverlayEl = document.getElementById("countdownOverlay");
  const countdownNumberEl = document.getElementById("countdownNumber");
  const modeProgressEl = document.getElementById("modeProgress");
  const modeScreenEl = document.getElementById("modeScreen");
  const modeScreenCardEl = document.getElementById("modeScreenCard");
  const modeScreenTitleEl = document.getElementById("modeScreenTitle");
  const modeScreenSubtitleEl = document.getElementById("modeScreenSubtitle");
  const modeScreenTimerEl = document.getElementById("modeScreenTimer");
  const timeBonusEl = document.getElementById("timeBonus");

  // ------------------------------ Utilities ---------------------------------
  const rand = (n) => Math.floor(Math.random() * n);
  const randomType = () => GEM_TYPES[rand(GEM_TYPES.length)];
  const sameType = (a, b) => !!a && !!b && a.shape === b.shape && a.color === b.color;
  const makeGem = (type) => ({ id: gemUid++, shape: type.shape, color: type.color });
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const currentTier = () => TIERS[tierIndex];
  // Frenzy-aware animation duration for a given ANIM key.
  const dur = (key) => Math.round(ANIM[key] * (frenzyActive ? FRENZY_SPEED_MULT : 1));

  function createEmptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  // Fill the board with random gems, rejecting any placement that would
  // create an immediate 3-in-a-row — horizontal, vertical, or diagonal, so
  // a reshuffle during Diagonal Time doesn't hand out a freebie either.
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
          (r >= 2 && sameType(type, board[r - 1][c]) && sameType(type, board[r - 2][c])) ||
          (r >= 2 && c >= 2 && sameType(type, board[r - 1][c - 1]) && sameType(type, board[r - 2][c - 2])) ||
          (r >= 2 && c + 2 < SIZE && sameType(type, board[r - 1][c + 1]) && sameType(type, board[r - 2][c + 2]))
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
  // Runs a 3+-in-a-row scan along one ordered line of [r,c] cells (a row, a
  // column, or a diagonal) and adds any run's coordinates to `matched`.
  function scanLineForMatches(cells, matched) {
    let runStart = 0;
    for (let i = 1; i <= cells.length; i++) {
      const cur = i < cells.length ? board[cells[i][0]][cells[i][1]] : null;
      const [pr, pc] = cells[i - 1];
      const prev = board[pr][pc];
      if (!cur || !prev || !sameType(cur, prev)) {
        if (i - runStart >= 3) {
          for (let k = runStart; k < i; k++) matched.add(`${cells[k][0]},${cells[k][1]}`);
        }
        runStart = i;
      }
    }
  }

  // Horizontal + vertical matches — the standard rule, active during
  // "Horizontal Time".
  function findOrthogonalMatches() {
    const matched = new Set();
    for (let r = 0; r < SIZE; r++) {
      const line = []; for (let c = 0; c < SIZE; c++) line.push([r, c]);
      scanLineForMatches(line, matched);
    }
    for (let c = 0; c < SIZE; c++) {
      const line = []; for (let r = 0; r < SIZE; r++) line.push([r, c]);
      scanLineForMatches(line, matched);
    }
    return matched;
  }

  // Diagonal-only matches ('\' and '/') — the special rule during
  // "Diagonal Time"; rows and columns don't clear at all in this mode.
  function findDiagonalMatches() {
    const matched = new Set();
    for (let d = -(SIZE - 1); d <= SIZE - 1; d++) { // '\' diagonals: r - c = d
      const line = [];
      for (let r = 0; r < SIZE; r++) { const c = r - d; if (c >= 0 && c < SIZE) line.push([r, c]); }
      scanLineForMatches(line, matched);
    }
    for (let s = 0; s <= (SIZE - 1) * 2; s++) { // '/' diagonals: r + c = s
      const line = [];
      for (let r = 0; r < SIZE; r++) { const c = s - r; if (c >= 0 && c < SIZE) line.push([r, c]); }
      scanLineForMatches(line, matched);
    }
    return matched;
  }

  function findMatches() {
    return matchMode === "diagonal" ? findDiagonalMatches() : findOrthogonalMatches();
  }

  function wouldMatchAt(testBoard, r, c) {
    const gem = testBoard[r][c];
    if (!gem) return false;
    if (matchMode === "diagonal") {
      let run = 1;
      for (let k = 1; r - k >= 0 && c - k >= 0 && sameType(testBoard[r - k][c - k], gem); k++) run++;
      for (let k = 1; r + k < SIZE && c + k < SIZE && sameType(testBoard[r + k][c + k], gem); k++) run++;
      if (run >= 3) return true;
      run = 1;
      for (let k = 1; r - k >= 0 && c + k < SIZE && sameType(testBoard[r - k][c + k], gem); k++) run++;
      for (let k = 1; r + k < SIZE && c - k >= 0 && sameType(testBoard[r + k][c - k], gem); k++) run++;
      return run >= 3;
    }
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

  // ---------------------------------- HUD ----------------------------------------
  function updateHud() {
    scoreValueEl.textContent = score.toLocaleString();
    meterFillEl.style.width = `${Math.min(100, meter)}%`;
    renderHearts();
    updateTimerUI();
  }

  function renderHearts() {
    const els = heartsRowEl.children;
    for (let i = 0; i < els.length; i++) {
      els[i].classList.toggle("is-filled", i < hearts);
    }
  }

  function updateTimerUI() {
    const secs = Math.max(0, Math.ceil(timeLeft));
    timerValueEl.textContent = String(secs);
    timerValueEl.classList.toggle("is-urgent", timeLeft > 0 && timeLeft <= 10);
    tierLabelEl.textContent = round > 1 ? `${currentTier().label} · R${round}` : currentTier().label;
    tierProgressEl.textContent = `${matchesThisTier}/${currentTier().quota}`;
    modeProgressEl.textContent = `${matchMode === "diagonal" ? "◆" : "▦"} ${modeMatchCount}/${MODE_SWITCH_THRESHOLD}`;
    modeProgressEl.classList.toggle("is-diagonal", matchMode === "diagonal");

    // Big bottom countdown for the final 10 seconds of a tier — ticks 10,
    // 9, 8 … 0, then disappears the moment the tier resets or ends.
    if (!gameOver && secs <= 10) {
      const changed = countdownOverlayEl.hidden || countdownNumberEl.textContent !== String(secs);
      countdownOverlayEl.hidden = false;
      countdownNumberEl.textContent = String(secs);
      if (changed) {
        countdownOverlayEl.classList.remove("is-tick");
        void countdownOverlayEl.offsetWidth;
        countdownOverlayEl.classList.add("is-tick");
      }
    } else {
      countdownOverlayEl.hidden = true;
    }
  }

  // Rewards a bonus moment (combo, power surge, Frenzy) with extra clock
  // time and a small floating "+5s" pop next to the timer.
  function addTime(seconds) {
    if (gameOver) return;
    timeLeft += seconds;
    updateHud();
    timeBonusEl.textContent = `+${seconds}s`;
    timeBonusEl.classList.remove("is-popping");
    void timeBonusEl.offsetWidth;
    timeBonusEl.classList.add("is-popping");
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
    showBanner._t = setTimeout(() => { bannerEl.hidden = true; }, 2100);
  }

  // ------------------------------- Power meter ------------------------------------
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
    addTime(TIME_BONUS_SECONDS);

    const wipeRow = rand(SIZE);
    const wipeCol = rand(SIZE);
    const keys = new Set();
    for (let c = 0; c < SIZE; c++) keys.add(`${wipeRow},${c}`);
    for (let r = 0; r < SIZE; r++) keys.add(`${r},${wipeCol}`);
    score += Math.round(keys.size * POINTS_PER_GEM * 2 * (frenzyActive ? FRENZY_SCORE_MULT : 1));
    return keys;
  }

  // -------------------------------- Frenzy mechanic ---------------------------------
  function applyAnimSpeed() {
    boardEl.style.setProperty("--dur-motion", `${dur("fallMs")}ms`);
    boardEl.style.setProperty("--dur-clear", `${dur("clearMs")}ms`);
  }

  function registerSuccessfulSwap() {
    matchStreak++;
    if (matchStreak % FRENZY_STREAK_STEP === 0) activateFrenzy();
  }

  function activateFrenzy() {
    frenzyActive = true;
    applyAnimSpeed();
    hudEl.classList.add("is-frenzy");
    frenzyTagEl.hidden = false;
    clearTimeout(frenzyTimeout);
    frenzyTimeout = setTimeout(endFrenzy, FRENZY_DURATION_MS);
    showBanner(`FRENZY! x${FRENZY_SCORE_MULT} score, faster tiles`, false);
    addTime(TIME_BONUS_SECONDS);
  }

  function endFrenzy() {
    if (!frenzyActive) return;
    frenzyActive = false;
    applyAnimSpeed();
    hudEl.classList.remove("is-frenzy");
    frenzyTagEl.hidden = true;
    clearTimeout(frenzyTimeout);
  }

  // ------------------------------- Hearts & tiers -----------------------------------
  // The reward for the game's single biggest "good job" moment (clearing a
  // whole tier). Heals a lost heart back; if already at full hearts the
  // reward converts to bonus score instead so it's never wasted.
  function gainHeart(scoreFallback) {
    if (hearts < MAX_HEARTS) {
      hearts++;
      const el = heartsRowEl.children[hearts - 1];
      if (el) {
        el.classList.add("is-gained");
        setTimeout(() => el.classList.remove("is-gained"), 650);
      }
      return true;
    }
    score += scoreFallback;
    return false;
  }

  function loseHeart(reason) {
    if (gameOver) return;
    hearts = Math.max(0, hearts - 1);
    matchStreak = 0;
    endFrenzy();
    const flashEl = heartsRowEl.children[hearts];
    if (flashEl) {
      flashEl.classList.add("is-losing");
      setTimeout(() => flashEl.classList.remove("is-losing"), 500);
    }
    if (hearts <= 0) {
      updateHud();
      triggerGameOver(reason);
      return;
    }
    if (reason === "timeout") {
      // Give the tier a completely fresh attempt — otherwise timeLeft would
      // sit at 0 and re-fire a heart loss on every following tick.
      matchesThisTier = 0;
      timeLeft = currentTier().seconds;
      showBanner(`Time's up! Retry ${currentTier().label}`, true);
    }
    updateHud();
  }

  function triggerGameOver(reason) {
    gameOver = true;
    clearInterval(timerInterval);
    const lead = reason === "timeout" ? "Out of time" : "Out of hearts";
    showBanner(`${lead} — Final Score ${score.toLocaleString()}`, true);
    setTimeout(resetRun, 2200);
  }

  function resetRun() {
    score = 0;
    hearts = MAX_HEARTS;
    tierIndex = 0;
    round = 1;
    matchesThisTier = 0;
    timeLeft = currentTier().seconds;
    matchStreak = 0;
    meter = 0;
    gameOver = false;
    matchMode = "orthogonal";
    modeMatchCount = 0;
    pendingModeSwitch = false;
    modeScreenEl.hidden = true;
    endFrenzy();
    initBoard();
    renderBoard(null);
    updateHud();
    startTimer();
  }

  // Timer for the active tier — pauses while a swap is mid-resolve so
  // animation time never eats into the countdown.
  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (gameOver || busy) return;
      timeLeft = Math.max(0, timeLeft - 1);
      updateTimerUI();
      if (timeLeft <= 0) loseHeart("timeout");
    }, 1000);
  }

  // Successful tier clear: time-bonus score, advance (looping tiers 1→2→3→1
  // with the round counter climbing) and give the next tier a fresh clock.
  function advanceTier() {
    const bonus = Math.round(timeLeft) * 15;
    score += bonus;
    const heartGained = gainHeart(250);
    const suffix = heartGained ? " — bonus heart!" : " (+250, hearts full)";
    showBanner(`${currentTier().label} clear! +${bonus.toLocaleString()} bonus${suffix}`, true);
    tierIndex++;
    if (tierIndex >= TIERS.length) {
      tierIndex = 0;
      round++;
    }
    matchesThisTier = 0;
    timeLeft = currentTier().seconds;
  }

  // ----------------------------- Match-mode cycle -----------------------------
  const otherMode = (mode) => (mode === "diagonal" ? "orthogonal" : "diagonal");

  // Every 20 matches in the current mode, hold a 5-second interstitial
  // announcing the switch, then flip the matching rule and reset the count.
  function showModeSwitchScreen() {
    return new Promise((resolve) => {
      const nextMode = otherMode(matchMode);
      const isDiagonal = nextMode === "diagonal";
      modeScreenCardEl.classList.toggle("is-diagonal", isDiagonal);
      modeScreenCardEl.classList.toggle("is-orthogonal", !isDiagonal);
      modeScreenTitleEl.textContent = isDiagonal ? "DIAGONAL TIME" : "HORIZONTAL TIME";
      modeScreenSubtitleEl.textContent = isDiagonal
        ? "Only diagonal 3-in-a-rows count now — rows and columns won’t clear!"
        : "Back to normal — rows and columns count again!";
      modeScreenEl.hidden = false;

      let remaining = Math.ceil(MODE_SCREEN_MS / 1000);
      const renderCountdown = () => { modeScreenTimerEl.textContent = `Starting in ${remaining}…`; };
      renderCountdown();
      const tick = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) renderCountdown();
      }, 1000);

      setTimeout(() => {
        clearInterval(tick);
        modeScreenEl.hidden = true;
        matchMode = nextMode;
        modeMatchCount = 0;
        pendingModeSwitch = false;
        updateHud();
        if (!hasAnyMove()) reshuffleBoard();
        resolve();
      }, MODE_SCREEN_MS);
    });
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
      score += Math.round(matched.size * POINTS_PER_GEM * combo * (frenzyActive ? FRENZY_SCORE_MULT : 1));
      matchesThisTier++;
      modeMatchCount++;
      if (modeMatchCount >= MODE_SWITCH_THRESHOLD) pendingModeSwitch = true;

      const clearKeys = new Set(matched);
      if (addPower(matched.size * METER_PER_GEM)) {
        const bonusKeys = triggerBonus();
        bonusKeys.forEach((k) => { if (!clearKeys.has(k)) markMatched(k); clearKeys.add(k); });
      }
      if (matchesThisTier >= currentTier().quota) advanceTier();
      updateHud();
      await wait(dur("clearMs"));

      const fallInfo = collapseAndRefill(clearKeys);
      renderBoard(fallInfo);
      await wait(dur("fallMs"));

      matched = findMatches();
      combo++;
    }
    if (combo > 2) {
      showBanner(`Combo x${combo - 1}!`, false);
      addTime(TIME_BONUS_SECONDS);
    }
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
    await wait(dur("swapMs"));

    swapCells(board, r1, c1, r2, c2);
    const matches = findMatches();
    if (matches.size === 0) {
      // no match — slide back to where they started, and an invalid move
      // costs a heart per the game's balancing rules
      if (el1) el1.style.transform = "";
      if (el2) el2.style.transform = "";
      await wait(dur("swapMs"));
      if (el1) { el1.classList.remove("is-falling"); el1.classList.add("is-invalid-swap"); setTimeout(() => el1.classList.remove("is-invalid-swap"), 300); }
      if (el2) el2.classList.remove("is-falling");
      busy = false;
      loseHeart("invalid");
      return;
    }
    registerSuccessfulSwap();
    renderBoard(null); // elements land exactly where the slide already placed them, no jump
    await resolveBoard(matches, 1);
    updateHud();
    // Busy (and so the timer) stays true/paused through the interstitial —
    // it's a forced break, not the player's move to spend time on.
    if (pendingModeSwitch && !gameOver) await showModeSwitchScreen();
    busy = false;
    if (!gameOver && !hasAnyMove()) reshuffleBoard();
  }

  function reshuffleBoard() {
    showBanner("No moves left — reshuffling", false);
    initBoard();
    renderBoard(null);
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
  // .gem__art is a fixed native-pixel box per shape (see CSS) so its
  // hand-drawn art stays crisp; here we drive its visual size with a
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
    applyAnimSpeed();
    updateHud();
    lockViewportGestures();
    initCursorFollower();
    syncGemScale();
    startTimer();
    if (window.ResizeObserver) {
      new ResizeObserver(syncGemScale).observe(boardEl);
    } else {
      window.addEventListener("resize", syncGemScale);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();

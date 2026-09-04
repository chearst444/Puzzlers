/* =========================================================================
   Growth Meter — Daily Bread devotional puzzle
   Five short stages, alternating a "vine path" rotate-to-connect puzzle
   with a memory-match puzzle. Each solved stage fills one segment of the
   striped growth meter and unlocks a short scripture + reflection line.
   No build step, no dependencies — everything below is vanilla DOM + SVG.
   ========================================================================= */

/* ------------------------------ Directions ------------------------------- */
const N = 0, E = 1, S = 2, W = 3;
const DIR_VECT = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const opposite = (d) => (d + 2) % 4;

function dirBetween(a, b) {
  const dr = b[0] - a[0], dc = b[1] - a[1];
  for (let d = 0; d < 4; d++) {
    if (DIR_VECT[d][0] === dr && DIR_VECT[d][1] === dc) return d;
  }
  throw new Error(`cells [${a}] -> [${b}] are not adjacent`);
}

/** Classify a tile from the two sides it must connect, and find the
 *  rotation (0-3, 90° steps clockwise) that turns the canonical art into
 *  that shape. Canonical straight = {N,S}; canonical elbow = {N,E}. */
function classify(sides) {
  const [a, b] = sides;
  if (opposite(a) === b) {
    const set = [a, b].sort().join(',');
    return { type: 'straight', solutionRotation: set === '0,2' ? 0 : 1 };
  }
  const want = [a, b].sort().join(',');
  const elbowSets = ['0,1', '1,2', '2,3', '0,3']; // r=0..3
  const r = elbowSets.indexOf(want);
  return { type: 'elbow', solutionRotation: r };
}

/** Build a vine-path stage definition from a bounding grid, an ordered
 *  path of [row,col] cells (entry to exit), and the outside border
 *  direction the flow enters/leaves from. */
function definePipePath(rows, cols, path, entryDir, exitDir) {
  const cells = path.map((rc, i) => {
    let sides;
    if (i === 0) {
      const outDir = path.length > 1 ? dirBetween(path[0], path[1]) : exitDir;
      sides = [entryDir, outDir];
    } else if (i === path.length - 1) {
      const inDir = dirBetween(path[i - 1], path[i]);
      sides = [opposite(inDir), exitDir];
    } else {
      sides = [opposite(dirBetween(path[i - 1], path[i])), dirBetween(path[i], path[i + 1])];
    }
    const { type, solutionRotation } = classify(sides);
    return { r: rc[0], c: rc[1], type, solutionRotation };
  });
  return {
    rows, cols, path: cells,
    entry: { r: path[0][0], c: path[0][1], dir: entryDir },
    exit: { r: path[path.length - 1][0], c: path[path.length - 1][1], dir: exitDir },
  };
}

/* --------------------------------- Icons ---------------------------------
   One line-art path per icon name, rendered two ways: `badgeIcon` uses
   currentColor so CSS drives its state (locked/current/complete); `cardIcon`
   paints a fixed Harvest-Palette color for the memory-match faces. */
const ICON_PATHS = {
  seed:    '<path d="M12 21c-4-1-6-4-6-8 0-5 3-9 6-11 3 2 6 6 6 11 0 4-2 7-6 8z"/><path d="M12 9c1-2 3-3 5-3"/>',
  root:    '<path d="M12 3v8"/><path d="M12 11c-3 1-3 5-5 9"/><path d="M12 11c3 1 3 5 5 9"/><path d="M12 11c0 3-1 6 0 9"/>',
  stem:    '<path d="M12 21V5"/><path d="M12 15c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 11c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
  bud:     '<path d="M12 21v-9"/><path d="M12 12c-3-1-4-4-3-7 3 0 6 2 6 5 0 1-1 2-3 2z"/>',
  harvest: '<path d="M12 21V9"/><path d="M12 13l-4-3M12 13l4-3M12 9l-3-4M12 9l3-4"/>',
  droplet: '<path d="M12 3c4 5 6 8.5 6 11.5A6 6 0 0 1 6 14.5C6 11.5 8 8 12 3z"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  leaf:    '<path d="M6 20C6 10 12 4 20 4c0 8-6 14-14 14z"/><path d="M6 20c2-4 5-7 9-9"/>',
};
const CARD_COLORS = { seed: 'var(--squash)', droplet: 'var(--sky-teal)', sun: 'var(--marigold)', leaf: 'var(--olive)' };

function badgeIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}
function cardIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" style="stroke:${CARD_COLORS[name]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}
function vineArt(type) {
  return type === 'straight'
    ? '<svg viewBox="0 0 100 100"><line class="vine-stroke" x1="50" y1="0" x2="50" y2="100" stroke-width="16" stroke-linecap="round"/><circle class="vine-node" cx="50" cy="50" r="7"/></svg>'
    : '<svg viewBox="0 0 100 100"><path class="vine-stroke" d="M50 0 L50 50 L100 50" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle class="vine-node" cx="50" cy="50" r="7"/></svg>';
}

/* --------------------------------- Stages --------------------------------- */
const STAGES = [
  {
    key: 'seed', label: 'Seed', icon: 'seed',
    title: 'Stage 1 · Seed', subtitle: 'Untangle the vine to the first sprout.',
    type: 'vine',
    pipe: definePipePath(2, 3, [[0, 0], [1, 0], [1, 1], [1, 2]], W, E),
    verseRef: 'John 12:24',
    verseText: '“Except a corn of wheat fall into the ground and die, it abideth alone: but if it die, it bringeth forth much fruit.”',
    reflection: 'Growth often starts hidden, in a surrender that looks like loss.',
  },
  {
    key: 'root', label: 'Root', icon: 'root',
    title: 'Stage 2 · Root', subtitle: 'Match the pairs that steady a life.',
    type: 'match', icons: ['seed', 'droplet', 'sun'],
    verseRef: 'Jeremiah 17:7-8',
    verseText: '“Blessed is the man that trusteth in the LORD... he shall be as a tree planted by the waters, that spreadeth out her roots by the river.”',
    reflection: 'Deep roots are rarely seen — but they are what steady you in a dry year.',
  },
  {
    key: 'stem', label: 'Stem', icon: 'stem',
    title: 'Stage 3 · Stem', subtitle: 'Connect the vine, root to branch.',
    type: 'vine',
    pipe: definePipePath(3, 3, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], N, E),
    verseRef: 'John 15:5',
    verseText: '“I am the vine, ye are the branches: he that abideth in me, and I in him, the same bringeth forth much fruit.”',
    reflection: 'Strength for growth flows from staying attached, not from trying harder alone.',
  },
  {
    key: 'bud', label: 'Bud', icon: 'bud',
    title: 'Stage 4 · Bud', subtitle: 'Match the pairs of a season turning.',
    type: 'match', icons: ['seed', 'droplet', 'sun', 'leaf'],
    verseRef: 'Philippians 1:6',
    verseText: '“Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ.”',
    reflection: 'What is only budding in you now is not finished — and it is not forgotten.',
  },
  {
    key: 'harvest', label: 'Harvest', icon: 'harvest',
    title: 'Stage 5 · Harvest', subtitle: 'Finish the longest vine of all.',
    type: 'vine',
    pipe: definePipePath(3, 3, [[1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]], W, S),
    verseRef: 'Galatians 6:9',
    verseText: '“Let us not be weary in well doing: for in due season we shall reap, if we faint not.”',
    reflection: 'Every unseen season of tending leads toward a season of reaping.',
  },
];

/* ------------------------------ Vine puzzle ------------------------------- */
function buildVineStage(container, stage, onSolved) {
  const { rows, cols, path, entry, exit } = stage.pipe;
  const pathMap = new Map(path.map((c) => [`${c.r},${c.c}`, c]));
  const rotation = new Map();
  path.forEach((c) => {
    const symmetry = c.type === 'straight' ? 2 : 4;
    const offsets = symmetry === 2 ? [1] : [1, 2, 3];
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    rotation.set(`${c.r},${c.c}`, (c.solutionRotation + offset) % 4);
  });

  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'vine-board';
  board.style.gridTemplateColumns = `repeat(${cols}, var(--vine-cell))`;
  board.style.gridTemplateRows = `repeat(${rows}, var(--vine-cell))`;

  let alreadySolved = false; // freezes the board once solved, so a click that
                              // lands during the ~1s success delay can't undo
                              // the connection or re-fire the reflection popup
  const cellEls = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      const cell = document.createElement('div');
      cell.className = 'vine-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (pathMap.has(key)) {
        const info = pathMap.get(key);
        cell.classList.add('vine-cell--path');
        const art = document.createElement('div');
        art.className = 'vine-cell__art';
        art.innerHTML = vineArt(info.type);
        art.style.transform = `rotate(${rotation.get(key) * 90}deg)`;
        cell.appendChild(art);
        cell.addEventListener('click', () => {
          if (alreadySolved) return;
          const next = (rotation.get(key) + 1) % 4;
          rotation.set(key, next);
          art.style.transform = `rotate(${next * 90}deg)`;
          checkSolved();
        });
        cellEls.push(cell);
        if (entry.r === r && entry.c === c) cell.appendChild(makePort('entry', entry.dir));
        if (exit.r === r && exit.c === c) cell.appendChild(makePort('exit', exit.dir));
      } else {
        cell.classList.add('vine-cell--filler');
      }
      board.appendChild(cell);
    }
  }

  const hint = document.createElement('div');
  hint.className = 'vine-board__hint';
  hint.textContent = 'Tap a vine to turn it.';
  board.appendChild(hint);
  container.appendChild(board);

  function checkSolved() {
    const solved = path.every((c) => {
      const symmetry = c.type === 'straight' ? 2 : 4;
      const rot = rotation.get(`${c.r},${c.c}`);
      return ((rot - c.solutionRotation) % symmetry + symmetry) % symmetry === 0;
    });
    if (!solved) return;
    alreadySolved = true;
    cellEls.forEach((cell) => cell.classList.add('is-flowing'));
    setTimeout(onSolved, 650);
  }
}

const DIR_CLASS = ['dir-n', 'dir-e', 'dir-s', 'dir-w'];
function makePort(kind, dir) {
  const port = document.createElement('div');
  port.className = `vine-port vine-port--${kind} vine-port--${DIR_CLASS[dir]}`;
  port.innerHTML = badgeIcon(kind === 'entry' ? 'seed' : 'bud');
  return port;
}

/* ----------------------------- Match puzzle -------------------------------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildMatchStage(container, stage, onSolved) {
  const names = stage.icons;
  const deck = shuffle(names.concat(names));
  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'match-board';
  board.dataset.cols = names.length <= 3 ? '3' : '4';

  let flipped = [];
  let lock = false;
  let matched = 0;

  deck.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div class="match-card__inner">
        <div class="match-card__face match-card__face--back"></div>
        <div class="match-card__face match-card__face--front">${cardIcon(name)}</div>
      </div>`;
    card.addEventListener('click', () => {
      if (lock || card.classList.contains('is-flipped') || card.classList.contains('is-matched')) return;
      card.classList.add('is-flipped');
      flipped.push({ card, name });
      if (flipped.length < 2) return;
      lock = true;
      const [a, b] = flipped;
      if (a.name === b.name) {
        a.card.classList.add('is-matched');
        b.card.classList.add('is-matched');
        flipped = [];
        lock = false;
        matched++;
        if (matched === names.length) setTimeout(onSolved, 400);
      } else {
        setTimeout(() => {
          a.card.classList.remove('is-flipped');
          b.card.classList.remove('is-flipped');
          flipped = [];
          lock = false;
        }, 700);
      }
    });
    board.appendChild(card);
  });

  container.appendChild(board);
}

/* -------------------------------- Controller -------------------------------- */
const stageWrap = document.getElementById('stageWrap');
const stageTitle = document.getElementById('stageTitle');
const stageSubtitle = document.getElementById('stageSubtitle');
const iconRow = document.getElementById('iconRow');
const meterInner = document.getElementById('meterInner');

const introOverlay = document.getElementById('introOverlay');
const reflectionOverlay = document.getElementById('reflectionOverlay');
const harvestOverlay = document.getElementById('harvestOverlay');

let segmentEls = [];
let badgeEls = [];

function buildMeter() {
  meterInner.innerHTML = '';
  iconRow.innerHTML = '';
  segmentEls = STAGES.map(() => {
    const seg = document.createElement('div');
    seg.className = 'meter-seg';
    seg.innerHTML = '<div class="meter-seg__fill"></div>';
    meterInner.appendChild(seg);
    return seg;
  });
  badgeEls = STAGES.map((stage) => {
    const item = document.createElement('div');
    item.className = 'icon-row__item';
    const badge = document.createElement('div');
    badge.className = 'stage-icon';
    badge.innerHTML = badgeIcon(stage.icon);
    item.appendChild(badge);
    iconRow.appendChild(item);
    return badge;
  });
}

function refreshMeter(currentIndex) {
  badgeEls.forEach((badge, i) => {
    badge.classList.toggle('is-complete', i < currentIndex);
    badge.classList.toggle('is-current', i === currentIndex);
  });
}

let current = 0;

function startStage(i) {
  current = i;
  const stage = STAGES[i];
  stageTitle.textContent = stage.title;
  stageSubtitle.textContent = stage.subtitle;
  refreshMeter(i);
  const onSolved = () => stageSolved(i);
  if (stage.type === 'vine') buildVineStage(stageWrap, stage, onSolved);
  else buildMatchStage(stageWrap, stage, onSolved);
}

function stageSolved(i) {
  segmentEls[i].classList.add('is-filled');
  badgeEls[i].classList.add('is-complete');
  badgeEls[i].classList.remove('is-current');
  const stage = STAGES[i];
  document.getElementById('reflectionStage').textContent = `Stage ${i + 1} of ${STAGES.length}`;
  document.getElementById('reflectionRef').textContent = stage.verseRef;
  document.getElementById('reflectionVerse').textContent = stage.verseText;
  document.getElementById('reflectionNote').textContent = stage.reflection;
  const continueBtn = document.getElementById('continueBtn');
  continueBtn.textContent = i === STAGES.length - 1 ? 'See the Harvest' : 'Continue';
  setTimeout(() => { reflectionOverlay.hidden = false; }, 300);
}

document.getElementById('beginBtn').addEventListener('click', () => {
  introOverlay.hidden = true;
  startStage(0);
});

document.getElementById('continueBtn').addEventListener('click', () => {
  reflectionOverlay.hidden = true;
  if (current < STAGES.length - 1) {
    startStage(current + 1);
  } else {
    showHarvest();
  }
});

function showHarvest() {
  refreshMeter(STAGES.length);
  stageTitle.textContent = 'Harvest';
  stageSubtitle.textContent = 'Every stage tended.';
  stageWrap.innerHTML = '';
  const list = document.getElementById('harvestList');
  list.innerHTML = STAGES.map((s) => `
    <li>
      <div class="h-ref">${s.verseRef}</div>
      <div class="h-verse">${s.verseText}</div>
    </li>`).join('');
  harvestOverlay.hidden = false;
}

document.getElementById('restartBtn').addEventListener('click', () => {
  harvestOverlay.hidden = true;
  buildMeter();
  stageTitle.textContent = '';
  stageSubtitle.textContent = '';
  stageWrap.innerHTML = '';
  introOverlay.hidden = false;
});

buildMeter();
refreshMeter(0);

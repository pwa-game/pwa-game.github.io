const SIZE = 4;
const BEST_KEY = 'pwa-games.2048.best';
const STATE_KEY = 'pwa-games.2048.state.v1';
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const movesEl = document.getElementById('moves');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayTextEl = document.getElementById('overlay-text');
const overlayResumeEl = document.getElementById('overlay-resume');
const overlayNewEl = document.getElementById('overlay-new');
const AXIS_LOCK_PX = 10;
const SETTLE_MS = 105;
const MAX_RESISTANCE_PX = 14;

let grid = [];
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let moves = 0;
let won = false;
let previous;
let animating = false;
let animationTimer;
let queuedDirection;
let dragState;
let cellLayerEl;
let tileLayerEl;
let pendingRestore;

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneGrid(source) {
  return source.map((row) => [...row]);
}

function startGame() {
  clearTimeout(animationTimer);
  animating = false;
  queuedDirection = undefined;
  dragState = undefined;
  pendingRestore = undefined;
  grid = emptyGrid();
  score = 0;
  moves = 0;
  won = false;
  previous = undefined;
  addRandomTile();
  addRandomTile();
  clearSavedState();
  overlayEl.classList.add('hidden');
  render();
}

function initializeGame() {
  const saved = loadSavedState();
  if (saved) {
    applyState(saved);
    showRestorePrompt(saved);
  } else {
    startGame();
  }
}

function addRandomTile(target = grid) {
  const empty = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (target[y][x] === 0) empty.push({ x, y });
    }
  }
  if (empty.length === 0) return;
  const cell = empty[Math.floor(Math.random() * empty.length)];
  target[cell.y][cell.x] = Math.random() < 0.9 ? 2 : 4;
  return cell;
}

function render(options = {}) {
  const metrics = boardMetrics();
  const mergedCells = new Set((options.mergedCells || []).map((cell) => cellKey(cell.x, cell.y)));

  ensureBoardLayers();
  resetLayerOffset();
  layoutBoardLayers(metrics);
  const fragment = document.createDocumentFragment();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = grid[y][x];
      if (!value) continue;
      const key = cellKey(x, y);
      const isAdded = options.added && options.added.x === x && options.added.y === y;
      const tile = createTile(value, { x, y }, metrics, {
        isAdded,
        isMerged: mergedCells.has(key)
      });
      fragment.appendChild(tile);
    }
  }
  tileLayerEl.replaceChildren(fragment);
  renderStats();
}

function move(direction) {
  if (animating || dragState) {
    queuedDirection = direction;
    return;
  }
  const result = buildMove(direction);
  if (!result.changed) {
    messageEl.textContent = '这个方向没有可移动的数字。';
    return;
  }

  const snapshot = snapshotState();
  const metrics = boardMetrics();
  const items = renderMotionTiles(result.moves, metrics, 'settling');
  animating = true;
  clearTimeout(animationTimer);
  tileLayerEl.getBoundingClientRect();
  requestAnimationFrame(() => {
    settleTilesTo(items, metrics, 'target');
    animationTimer = window.setTimeout(() => {
      animating = false;
      const blocked = finalizeMove(result, snapshot);
      processQueuedMove(blocked);
    }, SETTLE_MS);
  });
}

function buildMove(direction, sourceGrid = grid) {
  const next = emptyGrid();
  const movesForAnimation = [];
  const mergedTargets = [];
  let gained = 0;

  for (let line = 0; line < SIZE; line += 1) {
    const entries = travelPositions(direction, line)
      .map((position) => ({ ...position, value: sourceGrid[position.y][position.x] }))
      .filter((entry) => entry.value);
    const output = [];
    entries.forEach((entry) => {
      const last = output[output.length - 1];
      if (last && !last.merged && last.value === entry.value) {
        last.value *= 2;
        last.merged = true;
        last.sources.push(entry);
        gained += last.value;
      } else {
        output.push({ value: entry.value, merged: false, sources: [entry] });
      }
    });

    output.forEach((entry, index) => {
      const to = targetPosition(direction, line, index);
      next[to.y][to.x] = entry.value;
      if (entry.merged) mergedTargets.push(to);
      entry.sources.forEach((source) => {
        movesForAnimation.push({ from: { x: source.x, y: source.y }, to, value: source.value, merged: entry.merged });
      });
    });
  }

  return {
    direction,
    grid: next,
    gained,
    moves: movesForAnimation,
    mergedTargets,
    changed: JSON.stringify(next) !== JSON.stringify(sourceGrid)
  };
}

function finalizeMove(result, snapshot) {
  previous = snapshot;
  score += result.gained;
  moves += 1;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }

  const finalGrid = cloneGrid(result.grid);
  const added = addRandomTile(finalGrid);
  grid = finalGrid;

  const maxTile = Math.max(...finalGrid.flat());
  let pendingOverlay;
  if (!won && maxTile >= 2048) {
    won = true;
    pendingOverlay = ['2048!', '可以继续冲更高分。', true];
  } else if (!canMove(finalGrid)) {
    pendingOverlay = ['游戏结束', '棋盘没有可移动的格子。', false];
  } else {
    messageEl.textContent = result.gained > 0 ? `+${result.gained}` : '继续滑动。';
  }

  render({ added, mergedCells: result.mergedTargets });
  if (pendingOverlay) showOverlay(...pendingOverlay);
  persistState();
  return Boolean(pendingOverlay);
}

function processQueuedMove(blockedByOverlay) {
  const nextDirection = queuedDirection;
  queuedDirection = undefined;
  if (nextDirection && !blockedByOverlay) move(nextDirection);
}

function snapshotState() {
  return { grid: cloneGrid(grid), score, moves, won };
}

function travelPositions(direction, line) {
  if (direction === 'left') return [0, 1, 2, 3].map((x) => ({ x, y: line }));
  if (direction === 'right') return [3, 2, 1, 0].map((x) => ({ x, y: line }));
  if (direction === 'up') return [0, 1, 2, 3].map((y) => ({ x: line, y }));
  return [3, 2, 1, 0].map((y) => ({ x: line, y }));
}

function targetPosition(direction, line, index) {
  if (direction === 'left') return { x: index, y: line };
  if (direction === 'right') return { x: SIZE - 1 - index, y: line };
  if (direction === 'up') return { x: line, y: index };
  return { x: line, y: SIZE - 1 - index };
}

function boardMetrics() {
  const styles = getComputedStyle(boardEl);
  const gap = parseFloat(styles.getPropertyValue('--tile-gap')) || 10;
  const width = boardEl.clientWidth || 360;
  const height = boardEl.clientHeight || width;
  const boardSize = Math.min(width, height);
  const size = Math.max(1, (boardSize - gap * 5) / SIZE);
  const drawnSize = size * SIZE + gap * (SIZE + 1);
  const offsetX = (width - drawnSize) / 2;
  const offsetY = (height - drawnSize) / 2;
  return { gap, size, step: size + gap, drawnSize, offsetX, offsetY };
}

function tileTransform(position, metrics, offset = { x: 0, y: 0 }) {
  return `translate3d(${metrics.offsetX + metrics.gap + position.x * metrics.step + offset.x}px, ${metrics.offsetY + metrics.gap + position.y * metrics.step + offset.y}px, 0)`;
}

function setTilePosition(tile, position, metrics, offset) {
  tile.style.transform = tileTransform(position, metrics, offset);
}

function ensureBoardLayers() {
  if (cellLayerEl && tileLayerEl && cellLayerEl.parentElement === boardEl && tileLayerEl.parentElement === boardEl) return;
  boardEl.replaceChildren();
  cellLayerEl = createCellLayer();
  tileLayerEl = document.createElement('div');
  tileLayerEl.className = 'tile-layer';
  boardEl.append(cellLayerEl, tileLayerEl);
}

function resetLayerOffset() {
  if (!tileLayerEl) return;
  tileLayerEl.style.transition = '';
  tileLayerEl.style.transform = '';
}

function layoutBoardLayers(metrics) {
  if (!cellLayerEl || !tileLayerEl) return;
  cellLayerEl.style.left = `${metrics.offsetX + metrics.gap}px`;
  cellLayerEl.style.top = `${metrics.offsetY + metrics.gap}px`;
  cellLayerEl.style.width = `${metrics.drawnSize - metrics.gap * 2}px`;
  cellLayerEl.style.height = `${metrics.drawnSize - metrics.gap * 2}px`;
  tileLayerEl.style.inset = '0';
}

function createCellLayer() {
  const cellLayer = document.createElement('div');
  cellLayer.className = 'cell-layer';
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cellLayer.appendChild(cell);
  }
  return cellLayer;
}

function createTile(value, position, metrics, options = {}) {
  const tile = document.createElement('div');
  tile.className = ['tile', options.phase || ''].join(' ');
  tile.dataset.value = String(value);
  tile.style.width = `${metrics.size}px`;
  tile.style.height = `${metrics.size}px`;
  setTilePosition(tile, position, metrics);

  const inner = document.createElement('div');
  inner.className = [
    'tile-inner',
    value > 2048 ? 'super' : '',
    options.isAdded ? 'tile-new' : '',
    options.isMerged ? 'tile-merged' : ''
  ].join(' ');
  inner.textContent = String(value);
  tile.appendChild(inner);
  return tile;
}

function renderMotionTiles(moveList, metrics, phase) {
  ensureBoardLayers();
  resetLayerOffset();
  const fragment = document.createDocumentFragment();
  const items = [];
  moveList.forEach((move) => {
    const tile = createTile(move.value, move.from, metrics, { phase });
    fragment.appendChild(tile);
    items.push({ move, tile });
  });
  tileLayerEl.replaceChildren(fragment);
  return items;
}

function settleTilesTo(items, metrics, destination) {
  items.forEach(({ move, tile }) => {
    const position = destination === 'target' ? move.to : move.from;
    setTilePosition(tile, position, metrics);
  });
}

function directionFromDelta(dx, dy) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < AXIS_LOCK_PX || absDx === absDy) return undefined;
  if (absDx > absDy) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function directionVector(direction) {
  if (direction === 'left') return { x: -1, y: 0 };
  if (direction === 'right') return { x: 1, y: 0 };
  if (direction === 'up') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function axisDistance(direction, dx, dy) {
  if (direction === 'left') return -dx;
  if (direction === 'right') return dx;
  if (direction === 'up') return -dy;
  return dy;
}

function moveDistanceCells(move) {
  return Math.abs(move.from.x - move.to.x) + Math.abs(move.from.y - move.to.y);
}

function commitThreshold(metrics) {
  return Math.min(metrics.step * 0.28, 42);
}

function updateDragPreview(state, dx, dy) {
  const vector = directionVector(state.direction);
  const distance = Math.max(0, axisDistance(state.direction, dx, dy));
  state.distance = distance;
  state.items.forEach(({ move, tile }) => {
    const maxDistance = moveDistanceCells(move) * state.metrics.step;
    const offsetDistance = Math.min(distance, maxDistance);
    setTilePosition(tile, move.from, state.metrics, {
      x: vector.x * offsetDistance,
      y: vector.y * offsetDistance
    });
  });
}

function updateNoopResistance(state, dx, dy) {
  const vector = directionVector(state.direction);
  const distance = Math.max(0, axisDistance(state.direction, dx, dy));
  const resistance = Math.min(distance * 0.18, MAX_RESISTANCE_PX);
  state.distance = distance;
  tileLayerEl.style.transition = 'none';
  tileLayerEl.style.transform = `translate3d(${vector.x * resistance}px, ${vector.y * resistance}px, 0)`;
}

function settleDragCommit(state) {
  animating = true;
  clearTimeout(animationTimer);
  state.items.forEach(({ tile }) => {
    tile.classList.remove('dragging');
    tile.classList.add('settling');
  });
  tileLayerEl.getBoundingClientRect();
  requestAnimationFrame(() => {
    settleTilesTo(state.items, state.metrics, 'target');
    animationTimer = window.setTimeout(() => {
      animating = false;
      const blocked = finalizeMove(state.result, state.snapshot);
      processQueuedMove(blocked);
    }, SETTLE_MS);
  });
}

function settleDragCancel(state) {
  animating = true;
  clearTimeout(animationTimer);
  state.items.forEach(({ tile }) => {
    tile.classList.remove('dragging');
    tile.classList.add('settling');
  });
  tileLayerEl.getBoundingClientRect();
  requestAnimationFrame(() => {
    settleTilesTo(state.items, state.metrics, 'source');
    animationTimer = window.setTimeout(() => {
      animating = false;
      render();
      processQueuedMove(false);
    }, SETTLE_MS);
  });
}

function settleNoopResistance() {
  animating = true;
  clearTimeout(animationTimer);
  tileLayerEl.style.transition = `transform ${SETTLE_MS}ms ease-out`;
  tileLayerEl.style.transform = 'translate3d(0, 0, 0)';
  animationTimer = window.setTimeout(() => {
    animating = false;
    resetLayerOffset();
    messageEl.textContent = '这个方向没有可移动的数字。';
    processQueuedMove(false);
  }, SETTLE_MS);
}

function handlePointerDown(event) {
  if (animating || pendingRestore) return;
  event.preventDefault();
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    direction: undefined,
    changed: false,
    distance: 0,
    metrics: boardMetrics(),
    items: [],
    result: undefined,
    snapshot: undefined
  };
  if (boardEl.setPointerCapture) boardEl.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  if (!dragState.direction) {
    const direction = directionFromDelta(dx, dy);
    if (!direction) return;
    const result = buildMove(direction);
    dragState.direction = direction;
    dragState.result = result;
    dragState.snapshot = snapshotState();
    dragState.metrics = boardMetrics();
    dragState.changed = result.changed;
    if (result.changed) {
      dragState.items = renderMotionTiles(result.moves, dragState.metrics, 'dragging');
      updateDragPreview(dragState, dx, dy);
    } else {
      ensureBoardLayers();
      updateNoopResistance(dragState, dx, dy);
    }
    return;
  }

  if (dragState.changed) {
    updateDragPreview(dragState, dx, dy);
  } else {
    updateNoopResistance(dragState, dx, dy);
  }
}

function handlePointerUp(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  const state = dragState;
  dragState = undefined;
  if (boardEl.releasePointerCapture) {
    try {
      boardEl.releasePointerCapture(event.pointerId);
    } catch {
      // Some browsers release capture automatically before pointerup.
    }
  }

  if (!state.direction) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  const distance = Math.max(0, axisDistance(state.direction, dx, dy));

  if (!state.changed) {
    settleNoopResistance();
    return;
  }

  if (distance >= commitThreshold(state.metrics)) {
    settleDragCommit(state);
  } else {
    settleDragCancel(state);
  }
}

function handlePointerCancel(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const state = dragState;
  dragState = undefined;
  if (!state.direction) {
    render();
  } else if (state.changed) {
    settleDragCancel(state);
  } else {
    settleNoopResistance();
  }
}

function renderStats() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  movesEl.textContent = String(moves);
  document.getElementById('undo').disabled = !previous || animating || Boolean(dragState) || Boolean(pendingRestore);
}

function cellKey(x, y) {
  return `${x}:${y}`;
}

function canMove(target = grid) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (target[y][x] === 0) return true;
      if (x < SIZE - 1 && target[y][x] === target[y][x + 1]) return true;
      if (y < SIZE - 1 && target[y][x] === target[y + 1][x]) return true;
    }
  }
  return false;
}

function showOverlay(title, text, resumable = false) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayResumeEl.classList.toggle('hidden', !resumable);
  overlayNewEl.classList.toggle('primary', !resumable);
  overlayEl.classList.remove('hidden');
}

function undo() {
  if (!previous || animating || dragState || pendingRestore) return;
  grid = cloneGrid(previous.grid);
  score = previous.score;
  moves = previous.moves;
  won = previous.won;
  previous = undefined;
  overlayEl.classList.add('hidden');
  messageEl.textContent = '已撤销一步。';
  render();
  persistState();
}

function directionFromKey(key) {
  return { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[key];
}

window.addEventListener('keydown', (event) => {
  const direction = directionFromKey(event.key);
  if (!direction) return;
  event.preventDefault();
  if (pendingRestore) return;
  move(direction);
});

boardEl.addEventListener('pointerdown', handlePointerDown);
boardEl.addEventListener('pointermove', handlePointerMove);
boardEl.addEventListener('pointerup', handlePointerUp);
boardEl.addEventListener('pointercancel', handlePointerCancel);
boardEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.getElementById('new-game').addEventListener('click', startGame);
overlayNewEl.addEventListener('click', startGame);
overlayResumeEl.addEventListener('click', () => {
  if (pendingRestore) {
    pendingRestore = undefined;
    messageEl.textContent = '已恢复上次游戏。';
  }
  overlayEl.classList.add('hidden');
  render();
});
document.getElementById('undo').addEventListener('click', undo);
window.addEventListener('resize', () => {
  if (!animating && !dragState) render();
});

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistState();
});
window.addEventListener('pagehide', persistState);

function showRestorePrompt(saved) {
  pendingRestore = saved;
  showOverlay('继续上次游戏？', `分数 ${saved.score} · 步数 ${saved.moves}`, true);
  messageEl.textContent = '发现未结束的 2048。';
}

function applyState(state) {
  clearTimeout(animationTimer);
  animating = false;
  queuedDirection = undefined;
  dragState = undefined;
  grid = cloneGrid(state.grid);
  score = state.score;
  moves = state.moves;
  won = state.won;
  previous = state.previous ? {
    grid: cloneGrid(state.previous.grid),
    score: state.previous.score,
    moves: state.previous.moves,
    won: state.previous.won
  } : undefined;
  overlayEl.classList.add('hidden');
  render();
  if (!canMove(grid)) {
    clearSavedState();
    showOverlay('游戏结束', '棋盘没有可移动的格子。');
  }
}

function persistState() {
  if (!shouldPersistState()) {
    clearSavedState();
    return;
  }
  const state = {
    grid: cloneGrid(grid),
    score,
    moves,
    won,
    previous: previous ? {
      grid: cloneGrid(previous.grid),
      score: previous.score,
      moves: previous.moves,
      won: previous.won
    } : undefined
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function shouldPersistState() {
  return moves > 0 && canMove(grid);
}

function clearSavedState() {
  localStorage.removeItem(STATE_KEY);
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return undefined;
    const state = JSON.parse(raw);
    if (!isValidGrid(state.grid)) return undefined;
    if (!Number.isFinite(state.score) || !Number.isFinite(state.moves)) return undefined;
    if (state.moves <= 0 || !canMove(state.grid)) return undefined;
    if (state.previous && (!isValidGrid(state.previous.grid) || !Number.isFinite(state.previous.score) || !Number.isFinite(state.previous.moves))) {
      return undefined;
    }
    return {
      grid: state.grid,
      score: Math.max(0, Math.floor(state.score)),
      moves: Math.max(0, Math.floor(state.moves)),
      won: Boolean(state.won),
      previous: state.previous ? {
        grid: state.previous.grid,
        score: Math.max(0, Math.floor(state.previous.score)),
        moves: Math.max(0, Math.floor(state.previous.moves)),
        won: Boolean(state.previous.won)
      } : undefined
    };
  } catch {
    clearSavedState();
    return undefined;
  }
}

function isValidGrid(candidate) {
  return Array.isArray(candidate) &&
    candidate.length === SIZE &&
    candidate.every((row) => Array.isArray(row) && row.length === SIZE && row.every((value) => Number.isInteger(value) && value >= 0));
}

initializeGame();

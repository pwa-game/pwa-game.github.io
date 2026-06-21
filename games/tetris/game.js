const COLS = 10;
const ROWS = 20;
const STATE_KEY = 'pwa-games.tetris.state.v1';
const COLORS = {
  I: '#40d9f4',
  O: '#ffd84d',
  T: '#b46cff',
  S: '#65d66e',
  Z: '#f25d58',
  J: '#5b8cff',
  L: '#ff9f37'
};
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
const BAG = Object.keys(SHAPES);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayTextEl = document.getElementById('overlay-text');
const pauseButton = document.getElementById('pause');
const resumeButton = document.getElementById('resume');
const overlayNewButton = document.getElementById('overlay-new');

let board;
let piece;
let nextPiece;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let lastTime = 0;
let paused = false;
let gameOver = false;
let animationFrame;
let touchGesture;
let pendingRestore = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const type = BAG[Math.floor(Math.random() * BAG.length)];
  return { type, x: 3, y: 0, cells: SHAPES[type].map(([x, y]) => ({ x, y })) };
}

function startGame() {
  clearSavedState();
  pendingRestore = false;
  board = createBoard();
  piece = randomPiece();
  nextPiece = randomPiece();
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  lastTime = 0;
  paused = false;
  gameOver = false;
  overlayEl.classList.add('hidden');
  pauseButton.textContent = '暂停';
  messageEl.textContent = '画布手势：左右滑移动，点按或上滑旋转，下滑硬降。';
  updateStats();
  draw();
  ensureLoop();
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

function ensureLoop() {
  cancelAnimationFrame(animationFrame);
  lastTime = 0;
  animationFrame = requestAnimationFrame(update);
}

function update(time = 0) {
  if (gameOver) return;
  const delta = lastTime ? time - lastTime : 0;
  lastTime = time;
  if (!paused) {
    dropCounter += delta;
    if (dropCounter > dropInterval()) {
      stepDown(false);
      dropCounter = 0;
      persistState();
    }
    draw();
  }
  animationFrame = requestAnimationFrame(update);
}

function dropInterval() {
  return Math.max(110, 760 - (level - 1) * 58);
}

function draw() {
  const size = resizeCanvasToDisplay(canvas, ctx);
  const geometry = boardGeometry(size);
  ctx.clearRect(0, 0, size.width, size.height);
  drawBackground(ctx, geometry);
  board.forEach((row, y) => row.forEach((type, x) => type && drawBlock(ctx, x, y, COLORS[type], false, geometry)));
  ghostY().forEach(({ x, y }) => drawBlock(ctx, x, y, 'rgba(255,255,255,0.20)', true, geometry));
  piece.cells.forEach((cell) => drawBlock(ctx, piece.x + cell.x, piece.y + cell.y, COLORS[piece.type], false, geometry));
  drawNext();
}

function resizeCanvasToDisplay(target, context) {
  const ratio = window.devicePixelRatio || 1;
  const rect = target.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function boardGeometry(size) {
  return {
    width: size.width,
    height: size.height,
    cellW: size.width / COLS,
    cellH: size.height / ROWS
  };
}

function drawBackground(context, geometry) {
  context.fillStyle = '#07101c';
  context.fillRect(0, 0, geometry.width, geometry.height);
  context.strokeStyle = 'rgba(255,255,255,0.07)';
  context.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    context.beginPath();
    context.moveTo(x * geometry.cellW, 0);
    context.lineTo(x * geometry.cellW, geometry.height);
    context.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    context.beginPath();
    context.moveTo(0, y * geometry.cellH);
    context.lineTo(geometry.width, y * geometry.cellH);
    context.stroke();
  }
}

function drawBlock(context, x, y, color, ghost = false, geometry = boardGeometry({ width: canvas.width, height: canvas.height })) {
  const inset = Math.max(1, Math.min(3, Math.min(geometry.cellW, geometry.cellH) * 0.08));
  const radius = Math.max(2, Math.min(8, Math.min(geometry.cellW, geometry.cellH) * 0.16));
  const left = x * geometry.cellW + inset;
  const top = y * geometry.cellH + inset;
  const width = geometry.cellW - inset * 2;
  const height = geometry.cellH - inset * 2;
  context.fillStyle = color;
  roundedRect(context, left, top, width, height, radius);
  context.fill();
  context.strokeStyle = ghost ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)';
  context.lineWidth = Math.max(1, inset * 0.65);
  roundedRect(context, left + inset * 0.35, top + inset * 0.35, width - inset * 0.7, height - inset * 0.7, radius);
  context.stroke();
}

function drawNext() {
  const size = resizeCanvasToDisplay(nextCanvas, nextCtx);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = 'rgba(0,0,0,0.22)';
  nextCtx.fillRect(0, 0, size.width, size.height);
  const minX = Math.min(...nextPiece.cells.map((cell) => cell.x));
  const maxX = Math.max(...nextPiece.cells.map((cell) => cell.x));
  const minY = Math.min(...nextPiece.cells.map((cell) => cell.y));
  const maxY = Math.max(...nextPiece.cells.map((cell) => cell.y));
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const scale = Math.min(size.width / (cols + 1.2), size.height / (rows + 1.2));
  const offsetX = (size.width - cols * scale) / 2;
  const offsetY = (size.height - rows * scale) / 2;
  nextPiece.cells.forEach((cell) => {
    nextCtx.fillStyle = COLORS[nextPiece.type];
    roundedRect(nextCtx, offsetX + (cell.x - minX) * scale, offsetY + (cell.y - minY) * scale, scale - 1, scale - 1, 4);
    nextCtx.fill();
  });
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function collides(candidate = piece, dx = 0, dy = 0, cells = candidate.cells) {
  return cells.some((cell) => {
    const x = candidate.x + cell.x + dx;
    const y = candidate.y + cell.y + dy;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
  });
}

function move(dx) {
  if (paused || gameOver || pendingRestore) return;
  if (!collides(piece, dx, 0)) {
    piece.x += dx;
    persistState();
  }
  draw();
}

function stepDown(save = true) {
  if (paused || gameOver || pendingRestore) return;
  if (!collides(piece, 0, 1)) {
    piece.y += 1;
  } else {
    lockPiece();
  }
  if (save) persistState();
  draw();
}

function rotate() {
  if (paused || gameOver || pendingRestore || piece.type === 'O') return;
  const rotated = piece.cells.map(({ x, y }) => ({ x: 2 - y, y: x }));
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(piece, kick, 0, rotated)) {
      piece.x += kick;
      piece.cells = rotated;
      draw();
      persistState();
      return;
    }
  }
}

function hardDrop() {
  if (paused || gameOver || pendingRestore) return;
  let distance = 0;
  while (!collides(piece, 0, 1)) {
    piece.y += 1;
    distance += 1;
  }
  score += distance * 2;
  lockPiece();
  persistState();
  draw();
}

function ghostY() {
  const ghost = { ...piece, cells: piece.cells.map((cell) => ({ ...cell })) };
  while (!collides(ghost, 0, 1)) ghost.y += 1;
  return ghost.cells.map((cell) => ({ x: ghost.x + cell.x, y: ghost.y + cell.y }));
}

function lockPiece() {
  piece.cells.forEach((cell) => {
    const x = piece.x + cell.x;
    const y = piece.y + cell.y;
    if (y >= 0) board[y][x] = piece.type;
  });
  clearLines();
  piece = nextPiece;
  nextPiece = randomPiece();
  if (collides(piece)) {
    gameOver = true;
    clearSavedState();
    showOverlay('游戏结束', '点击新局重新开始。', false);
  } else {
    persistState();
  }
  updateStats();
}

function clearLines() {
  let cleared = 0;
  board = board.filter((row) => {
    if (row.every(Boolean)) {
      cleared += 1;
      return false;
    }
    return true;
  });
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  if (cleared > 0) {
    const lineScores = [0, 100, 300, 500, 800];
    score += lineScores[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    messageEl.textContent = cleared === 4 ? 'Tetris! 四行消除。' : `消除 ${cleared} 行。`;
  }
}

function updateStats() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  levelEl.textContent = String(level);
}

function showOverlay(title, text, resumable = true) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  resumeButton.classList.toggle('hidden', !resumable);
  overlayNewButton.classList.toggle('primary', !resumable);
  overlayEl.classList.remove('hidden');
}

function togglePause(force) {
  if (gameOver || pendingRestore) return;
  paused = force == null ? !paused : force;
  pauseButton.textContent = paused ? '继续' : '暂停';
  overlayEl.classList.toggle('hidden', !paused);
  if (paused) showOverlay('暂停', '按继续回到游戏。', true);
  else lastTime = 0;
  persistState();
}

window.addEventListener('keydown', (event) => {
  const keyMap = {
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowDown: stepDown,
    ArrowUp: rotate,
    ' ': hardDrop,
    p: () => togglePause()
  };
  const action = keyMap[event.key];
  if (!action) return;
  event.preventDefault();
  action();
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'left') move(-1);
    if (action === 'right') move(1);
    if (action === 'rotate') rotate();
    if (action === 'soft') stepDown();
    if (action === 'drop') hardDrop();
  });
});

canvas.addEventListener('pointerdown', (event) => {
  if (paused || gameOver || pendingRestore) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  touchGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
});

canvas.addEventListener('pointermove', (event) => {
  if (!touchGesture || touchGesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - touchGesture.x;
  const dy = event.clientY - touchGesture.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  event.preventDefault();
  touchGesture.moved = true;
  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? 1 : -1);
    touchGesture.x = event.clientX;
    touchGesture.y = event.clientY;
  } else if (dy > 0) {
    hardDrop();
    touchGesture = undefined;
  } else {
    rotate();
    touchGesture = undefined;
  }
});

canvas.addEventListener('pointerup', (event) => {
  if (!touchGesture || touchGesture.pointerId !== event.pointerId) return;
  event.preventDefault();
  if (!touchGesture.moved) rotate();
  touchGesture = undefined;
});

canvas.addEventListener('pointercancel', () => {
  touchGesture = undefined;
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.getElementById('new-game').addEventListener('click', startGame);
pauseButton.addEventListener('click', () => togglePause());
resumeButton.addEventListener('click', () => {
  if (pendingRestore) {
    pendingRestore = false;
    paused = false;
    pauseButton.textContent = '暂停';
    overlayEl.classList.add('hidden');
    messageEl.textContent = '已恢复上次游戏。';
    ensureLoop();
    persistState();
    return;
  }
  togglePause(false);
});
overlayNewButton.addEventListener('click', startGame);

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autoPauseAndSave();
});
window.addEventListener('pagehide', autoPauseAndSave);
window.addEventListener('resize', () => {
  if (board && piece && nextPiece) draw();
});

function autoPauseAndSave() {
  if (!board || !piece || gameOver || pendingRestore) return;
  paused = true;
  pauseButton.textContent = '继续';
  showOverlay('暂停', '已自动暂停，按继续回到游戏。', true);
  persistState();
}

function showRestorePrompt(saved) {
  pendingRestore = true;
  paused = true;
  pauseButton.textContent = '继续';
  showOverlay('继续上次游戏？', `分数 ${saved.score} · 行数 ${saved.lines} · 等级 ${saved.level}`, true);
  messageEl.textContent = '发现未结束的俄罗斯方块。';
}

function applyState(state) {
  board = state.board.map((row) => [...row]);
  piece = clonePiece(state.piece);
  nextPiece = clonePiece(state.nextPiece);
  score = state.score;
  lines = state.lines;
  level = state.level;
  dropCounter = state.dropCounter;
  lastTime = 0;
  paused = true;
  gameOver = false;
  touchGesture = undefined;
  updateStats();
  draw();
}

function persistState() {
  if (!board || !piece || !nextPiece || gameOver) {
    clearSavedState();
    return;
  }
  const state = {
    board: board.map((row) => [...row]),
    piece: clonePiece(piece),
    nextPiece: clonePiece(nextPiece),
    score,
    lines,
    level,
    dropCounter: Math.max(0, Math.floor(dropCounter))
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function clearSavedState() {
  localStorage.removeItem(STATE_KEY);
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return undefined;
    const state = JSON.parse(raw);
    if (!isValidBoard(state.board) || !isValidPiece(state.piece) || !isValidPiece(state.nextPiece)) return undefined;
    if (!Number.isFinite(state.score) || !Number.isFinite(state.lines) || !Number.isFinite(state.level)) return undefined;
    return {
      board: state.board,
      piece: state.piece,
      nextPiece: state.nextPiece,
      score: Math.max(0, Math.floor(state.score)),
      lines: Math.max(0, Math.floor(state.lines)),
      level: Math.max(1, Math.floor(state.level)),
      dropCounter: Number.isFinite(state.dropCounter) ? Math.max(0, Math.floor(state.dropCounter)) : 0
    };
  } catch {
    clearSavedState();
    return undefined;
  }
}

function clonePiece(source) {
  return {
    type: source.type,
    x: source.x,
    y: source.y,
    cells: source.cells.map((cell) => ({ x: cell.x, y: cell.y }))
  };
}

function isValidBoard(candidate) {
  return Array.isArray(candidate) &&
    candidate.length === ROWS &&
    candidate.every((row) => Array.isArray(row) && row.length === COLS && row.every((value) => value == null || BAG.includes(value)));
}

function isValidPiece(candidate) {
  return candidate &&
    BAG.includes(candidate.type) &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Array.isArray(candidate.cells) &&
    candidate.cells.length > 0 &&
    candidate.cells.every((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y));
}

initializeGame();

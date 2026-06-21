const BEST_KEY = 'pwa-games.snake.best';
const STATE_KEY = 'pwa-games.snake.state.v1';
const BASE_SIZE = 20;
const TARGET_COLS = 18;
const TARGET_ROWS = 34;
const MIN_COLS = 14;
const MIN_ROWS = 18;
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const speedEl = document.getElementById('speed');
const messageEl = document.getElementById('message');
const pauseButton = document.getElementById('pause');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayTextEl = document.getElementById('overlay-text');
const resumeButton = document.getElementById('resume');
const overlayNewButton = document.getElementById('overlay-new');

let snake;
let food;
let direction;
let pendingDirection;
let score;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let speed;
let cols = BASE_SIZE;
let rows = BASE_SIZE;
let timer;
let paused;
let gameOver;
let touchStart;
let pendingRestore = false;

function startGame() {
  clearSavedState();
  syncGridToCanvas(false);
  const startX = Math.floor(cols / 2);
  const startY = Math.floor(rows / 2);
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = direction;
  score = 0;
  speed = 1;
  paused = false;
  gameOver = false;
  pendingRestore = false;
  overlayEl.classList.add('hidden');
  pauseButton.textContent = '暂停';
  messageEl.textContent = '滑动棋盘或使用方向键控制。';
  placeFood();
  updateStats();
  restartTimer();
  draw();
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

function restartTimer() {
  clearInterval(timer);
  timer = setInterval(tick, Math.max(58, 150 - (speed - 1) * 10));
}

function syncGridToCanvas(adjustEntities = true) {
  const geometry = canvasGeometry();
  const nextCols = Math.max(MIN_COLS, Math.round(geometry.width / geometry.targetCell));
  const nextRows = Math.max(MIN_ROWS, Math.round(geometry.height / geometry.targetCell));
  const changed = nextCols !== cols || nextRows !== rows;
  cols = nextCols;
  rows = nextRows;

  if (changed && adjustEntities && snake) {
    snake = snake
      .map((part) => ({ x: clamp(Math.round(part.x), 0, cols - 1), y: clamp(Math.round(part.y), 0, rows - 1) }))
      .filter((part, index, parts) => parts.findIndex((candidate) => candidate.x === part.x && candidate.y === part.y) === index);
    if (snake.length === 0) {
      snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
    }
    if (!food || !isValidPoint(food, cols, rows) || snake.some((part) => part.x === food.x && part.y === food.y)) {
      placeFood();
    }
    persistState();
  }

  return {
    ...geometry,
    cols,
    rows,
    cellW: geometry.width / cols,
    cellH: geometry.height / rows
  };
}

function canvasGeometry() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const canvasWidth = Math.round(width * ratio);
  const canvasHeight = Math.round(height * ratio);
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {
    width,
    height,
    targetCell: clamp(Math.min(width / TARGET_COLS, height / TARGET_ROWS), 16, 26)
  };
}

function tick() {
  if (paused || gameOver || pendingRestore) return;
  direction = pendingDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some((part) => part.x === head.x && part.y === head.y)) {
    endGame();
    return;
  }
  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 1;
    best = Math.max(best, score);
    localStorage.setItem(BEST_KEY, String(best));
    speed = Math.floor(score / 5) + 1;
    placeFood();
    restartTimer();
  } else {
    snake.pop();
  }
  updateStats();
  draw();
}

function placeFood() {
  do {
    food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  } while (snake.some((part) => part.x === food.x && part.y === food.y));
}

function setDirection(next) {
  if (paused || gameOver || pendingRestore) return;
  if (next.x + direction.x === 0 && next.y + direction.y === 0) return;
  pendingDirection = next;
  persistState();
}

function togglePause(force) {
  if (gameOver || pendingRestore) return;
  paused = force == null ? !paused : force;
  pauseButton.textContent = paused ? '继续' : '暂停';
  messageEl.textContent = paused ? '已暂停。' : '继续。';
  overlayEl.classList.toggle('hidden', !paused);
  if (paused) showOverlay('暂停', '按继续回到游戏。');
  persistState();
  draw();
}

function endGame() {
  gameOver = true;
  pendingRestore = false;
  clearInterval(timer);
  clearSavedState();
  overlayEl.classList.add('hidden');
  messageEl.textContent = `游戏结束，本局 ${score} 分。`;
  draw();
}

function updateStats() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  speedEl.textContent = String(speed);
}

function draw() {
  const geometry = syncGridToCanvas(true);
  const cellSize = Math.min(geometry.cellW, geometry.cellH);
  const inset = Math.max(2, cellSize * 0.12);
  ctx.fillStyle = '#07160f';
  ctx.fillRect(0, 0, geometry.width, geometry.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * geometry.cellW, 0);
    ctx.lineTo(x * geometry.cellW, geometry.height);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * geometry.cellH);
    ctx.lineTo(geometry.width, y * geometry.cellH);
    ctx.stroke();
  }

  ctx.fillStyle = '#ff5a48';
  ctx.beginPath();
  ctx.arc(food.x * geometry.cellW + geometry.cellW / 2, food.y * geometry.cellH + geometry.cellH / 2, cellSize * 0.36, 0, Math.PI * 2);
  ctx.fill();

  snake.forEach((part, index) => {
    const gradient = index === 0 ? '#ffd95a' : '#57d58e';
    ctx.fillStyle = gradient;
    roundRect(
      part.x * geometry.cellW + inset,
      part.y * geometry.cellH + inset,
      geometry.cellW - inset * 2,
      geometry.cellH - inset * 2,
      Math.max(4, cellSize * 0.22)
    );
    ctx.fill();
  });

  if (paused || gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.46)';
    ctx.fillRect(0, 0, geometry.width, geometry.height);
    ctx.fillStyle = '#fff8e6';
    ctx.font = '900 34px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(gameOver ? '游戏结束' : '暂停', geometry.width / 2, geometry.height / 2);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

window.addEventListener('keydown', (event) => {
  const dirs = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }
  };
  if (event.key === ' ') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (!dirs[event.key]) return;
  event.preventDefault();
  setDirection(dirs[event.key]);
});

document.querySelectorAll('[data-dir]').forEach((button) => {
  button.addEventListener('click', () => {
    const dirs = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };
    setDirection(dirs[button.dataset.dir]);
  });
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (gameOver) {
    startGame();
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  touchStart = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', (event) => {
  event.preventDefault();
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = undefined;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  if (Math.abs(dx) > Math.abs(dy)) setDirection({ x: dx > 0 ? 1 : -1, y: 0 });
  else setDirection({ x: 0, y: dy > 0 ? 1 : -1 });
});

canvas.addEventListener('pointercancel', () => {
  touchStart = undefined;
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
    restartTimer();
    persistState();
    draw();
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
  if (snake && food) draw();
});

function autoPauseAndSave() {
  if (!snake || gameOver || pendingRestore) return;
  paused = true;
  pauseButton.textContent = '继续';
  messageEl.textContent = '已自动暂停。';
  showOverlay('暂停', '已自动暂停，按继续回到游戏。');
  persistState();
  draw();
}

function showOverlay(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove('hidden');
}

function showRestorePrompt(saved) {
  pendingRestore = true;
  paused = true;
  pauseButton.textContent = '继续';
  showOverlay('继续上次游戏？', `分数 ${saved.score} · 速度 ${saved.speed}`);
  messageEl.textContent = '发现未结束的贪吃蛇。';
}

function applyState(state) {
  cols = state.cols;
  rows = state.rows;
  snake = state.snake.map((part) => ({ ...part }));
  food = { ...state.food };
  direction = { ...state.direction };
  pendingDirection = { ...state.pendingDirection };
  score = state.score;
  speed = state.speed;
  paused = true;
  gameOver = false;
  touchStart = undefined;
  clearInterval(timer);
  syncGridToCanvas(true);
  updateStats();
  draw();
}

function persistState() {
  if (!snake || !food || gameOver) {
    clearSavedState();
    return;
  }
  const state = {
    snake: snake.map((part) => ({ ...part })),
    food: { ...food },
    direction: { ...direction },
    pendingDirection: { ...pendingDirection },
    score,
    speed,
    cols,
    rows
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
    const savedCols = Number.isInteger(state.cols) ? Math.max(MIN_COLS, state.cols) : BASE_SIZE;
    const savedRows = Number.isInteger(state.rows) ? Math.max(MIN_ROWS, state.rows) : BASE_SIZE;
    if (!Array.isArray(state.snake) || state.snake.length < 1 || !state.snake.every((part) => isValidPoint(part, savedCols, savedRows))) return undefined;
    if (!isValidPoint(state.food, savedCols, savedRows) || !isValidDirection(state.direction) || !isValidDirection(state.pendingDirection)) return undefined;
    if (!Number.isFinite(state.score) || !Number.isFinite(state.speed)) return undefined;
    return {
      snake: state.snake,
      food: state.food,
      direction: state.direction,
      pendingDirection: state.pendingDirection,
      score: Math.max(0, Math.floor(state.score)),
      speed: Math.max(1, Math.floor(state.speed)),
      cols: savedCols,
      rows: savedRows
    };
  } catch {
    clearSavedState();
    return undefined;
  }
}

function isValidPoint(point, maxCols = cols, maxRows = rows) {
  return point &&
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < maxCols &&
    point.y < maxRows;
}

function isValidDirection(candidate) {
  return candidate &&
    Number.isInteger(candidate.x) &&
    Number.isInteger(candidate.y) &&
    Math.abs(candidate.x) + Math.abs(candidate.y) === 1;
}

initializeGame();

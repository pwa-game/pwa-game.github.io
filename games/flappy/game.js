const BEST_KEY = 'pwa-games.flappy.best';
const STATE_KEY = 'pwa-games.flappy.state.v1';
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const stateEl = document.getElementById('state');
const messageEl = document.getElementById('message');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayTextEl = document.getElementById('overlay-text');
const resumeButton = document.getElementById('resume');
const overlayNewButton = document.getElementById('overlay-new');

const bird = { x: 92, y: 250, vy: 0, radius: 15 };
let pipes = [];
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let running = false;
let paused = false;
let gameOver = false;
let frame = 0;
let lastTime = 0;
let lastFlapAt = 0;
let pendingRestore = false;
let resumeGraceUntil = 0;

function reset() {
  clearSavedState();
  bird.y = canvas.height * 0.46;
  bird.vy = 0;
  pipes = [];
  score = 0;
  frame = 0;
  lastFlapAt = 0;
  resumeGraceUntil = 0;
  running = false;
  paused = false;
  gameOver = false;
  pendingRestore = false;
  overlayEl.classList.add('hidden');
  pauseButton.textContent = '暂停';
  startButton.textContent = '点击开始';
  startButton.classList.remove('hidden');
  stateEl.textContent = '准备';
  messageEl.textContent = '点击画面、按钮或按空格让小鸟上升。';
  updateStats();
  draw();
}

function initializeGame() {
  const saved = loadSavedState();
  if (saved) {
    applyState(saved);
    showRestorePrompt(saved);
  } else {
    reset();
  }
}

function start() {
  if (gameOver) {
    reset();
  }
  pendingRestore = false;
  running = true;
  paused = false;
  gameOver = false;
  overlayEl.classList.add('hidden');
  startButton.classList.add('hidden');
  pauseButton.textContent = '暂停';
  stateEl.textContent = '飞行';
  flap();
  persistState();
}

function flap() {
  if (paused || pendingRestore) return;
  if (!running) {
    start();
    return;
  }
  if (gameOver) return;
  const now = performance.now();
  if (now - lastFlapAt < 70) return;
  lastFlapAt = now;
  bird.vy = -6.9;
}

function spawnPipe() {
  const gap = 142;
  const top = 74 + Math.random() * (canvas.height - gap - 170);
  pipes.push({ x: canvas.width + 24, top, gap, width: 56, scored: false });
}

function update(time = 0) {
  const delta = Math.min(32, time - lastTime || 16);
  lastTime = time;
  if (running && !paused && !gameOver && !pendingRestore && time >= resumeGraceUntil) {
    frame += delta;
    if (pipes.length === 0 || pipes[pipes.length - 1].x < canvas.width - 178) spawnPipe();
    bird.vy += 0.34 * (delta / 16);
    bird.y += bird.vy * (delta / 16);
    pipes.forEach((pipe) => {
      pipe.x -= 2.45 * (delta / 16);
      if (!pipe.scored && pipe.x + pipe.width < bird.x) {
        pipe.scored = true;
        score += 1;
        if (score > best) {
          best = score;
          localStorage.setItem(BEST_KEY, String(best));
        }
        updateStats();
        persistState();
      }
    });
    pipes = pipes.filter((pipe) => pipe.x + pipe.width > -20);
    if (hitGround() || pipes.some(hitPipe)) endGame();
  }
  draw();
  requestAnimationFrame(update);
}

function hitGround() {
  return bird.y - bird.radius < 0 || bird.y + bird.radius > canvas.height - 42;
}

function hitPipe(pipe) {
  const nearestX = Math.max(pipe.x, Math.min(bird.x, pipe.x + pipe.width));
  const inGap = bird.y - bird.radius > pipe.top && bird.y + bird.radius < pipe.top + pipe.gap;
  if (nearestX !== bird.x || inGap) {
    const topHit = circleRect(pipe.x, 0, pipe.width, pipe.top);
    const bottomHit = circleRect(pipe.x, pipe.top + pipe.gap, pipe.width, canvas.height - pipe.top - pipe.gap - 42);
    return topHit || bottomHit;
  }
  return true;
}

function circleRect(x, y, width, height) {
  const nearestX = Math.max(x, Math.min(bird.x, x + width));
  const nearestY = Math.max(y, Math.min(bird.y, y + height));
  return Math.hypot(bird.x - nearestX, bird.y - nearestY) < bird.radius;
}

function endGame() {
  running = false;
  paused = false;
  gameOver = true;
  pendingRestore = false;
  clearSavedState();
  overlayEl.classList.add('hidden');
  stateEl.textContent = '结束';
  messageEl.textContent = `本局 ${score} 分，点击重新开始。`;
  startButton.textContent = '重新开始';
  startButton.classList.remove('hidden');
}

function updateStats() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#123f5a');
  sky.addColorStop(0.62, '#2a856e');
  sky.addColorStop(1, '#17382e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 5; i += 1) {
    const x = (i * 96 - (frame || 0) * 0.012) % (canvas.width + 80);
    ctx.beginPath();
    ctx.ellipse(x, 70 + i * 34, 32, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  pipes.forEach(drawPipe);
  drawBird();

  ctx.fillStyle = '#675037';
  ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
  ctx.fillStyle = '#6cca63';
  ctx.fillRect(0, canvas.height - 48, canvas.width, 8);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '900 42px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(String(score), canvas.width / 2, 72);
}

function drawPipe(pipe) {
  ctx.fillStyle = '#2fbf6f';
  ctx.strokeStyle = '#137444';
  ctx.lineWidth = 3;
  drawPipeRect(pipe.x, -4, pipe.width, pipe.top + 4);
  drawPipeRect(pipe.x, pipe.top + pipe.gap, pipe.width, canvas.height - pipe.top - pipe.gap - 42);
}

function drawPipeRect(x, y, width, height) {
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#52df87';
  ctx.fillRect(x - 6, y + (y <= 0 ? height - 18 : 0), width + 12, 18);
  ctx.strokeRect(x - 6, y + (y <= 0 ? height - 18 : 0), width + 12, 18);
  ctx.fillStyle = '#2fbf6f';
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(Math.max(-0.45, Math.min(0.65, bird.vy / 10)));
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9d2e';
  ctx.beginPath();
  ctx.moveTo(13, -2);
  ctx.lineTo(30, 4);
  ctx.lineTo(13, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(7, -6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(9, -6, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.36)';
  ctx.beginPath();
  ctx.ellipse(-7, 5, 9, 5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'p') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.key !== ' ' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  if (event.repeat) return;
  flap();
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  flap();
});
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
startButton.addEventListener('click', flap);
document.getElementById('new-game').addEventListener('click', reset);
pauseButton.addEventListener('click', () => togglePause());
resumeButton.addEventListener('click', () => {
  if (pendingRestore) {
    pendingRestore = false;
    paused = false;
    running = true;
    lastTime = 0;
    resumeGraceUntil = performance.now() + 650;
    pauseButton.textContent = '暂停';
    overlayEl.classList.add('hidden');
    startButton.classList.add('hidden');
    stateEl.textContent = '飞行';
    messageEl.textContent = '已恢复上次飞行。';
    persistState();
    return;
  }
  togglePause(false);
});
overlayNewButton.addEventListener('click', reset);

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autoPauseAndSave();
});
window.addEventListener('pagehide', autoPauseAndSave);

function togglePause(force) {
  if (!running || gameOver || pendingRestore) return;
  paused = force == null ? !paused : force;
  pauseButton.textContent = paused ? '继续' : '暂停';
  if (paused) {
    showOverlay('暂停', '按继续回到游戏。');
    stateEl.textContent = '暂停';
  } else {
    overlayEl.classList.add('hidden');
    stateEl.textContent = '飞行';
    lastTime = 0;
    resumeGraceUntil = performance.now() + 650;
  }
  persistState();
  draw();
}

function autoPauseAndSave() {
  if (!running || gameOver || pendingRestore) return;
  paused = true;
  pauseButton.textContent = '继续';
  stateEl.textContent = '暂停';
  showOverlay('暂停', '已自动暂停，按继续回到游戏。');
  persistState();
}

function showOverlay(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove('hidden');
  startButton.classList.add('hidden');
}

function showRestorePrompt(saved) {
  pendingRestore = true;
  paused = true;
  running = true;
  pauseButton.textContent = '继续';
  stateEl.textContent = '暂停';
  showOverlay('继续上次游戏？', `分数 ${saved.score} · 管道 ${saved.pipes.length}`);
  messageEl.textContent = '发现未结束的 Flappy Bird。';
}

function applyState(state) {
  bird.y = state.bird.y;
  bird.vy = state.bird.vy;
  pipes = state.pipes.map((pipe) => ({ ...pipe }));
  score = state.score;
  frame = state.frame;
  lastFlapAt = 0;
  lastTime = 0;
  resumeGraceUntil = 0;
  running = true;
  paused = true;
  gameOver = false;
  pendingRestore = false;
  startButton.classList.add('hidden');
  updateStats();
  draw();
}

function persistState() {
  if (!running || gameOver) {
    clearSavedState();
    return;
  }
  const state = {
    bird: { y: bird.y, vy: bird.vy },
    pipes: pipes.map((pipe) => ({ ...pipe })),
    score,
    frame
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
    if (!state.bird || !Number.isFinite(state.bird.y) || !Number.isFinite(state.bird.vy)) return undefined;
    if (!Array.isArray(state.pipes) || !state.pipes.every(isValidPipe)) return undefined;
    if (!Number.isFinite(state.score) || !Number.isFinite(state.frame)) return undefined;
    return {
      bird: { y: state.bird.y, vy: state.bird.vy },
      pipes: state.pipes,
      score: Math.max(0, Math.floor(state.score)),
      frame: Math.max(0, state.frame)
    };
  } catch {
    clearSavedState();
    return undefined;
  }
}

function isValidPipe(pipe) {
  return pipe &&
    Number.isFinite(pipe.x) &&
    Number.isFinite(pipe.top) &&
    Number.isFinite(pipe.gap) &&
    Number.isFinite(pipe.width) &&
    typeof pipe.scored === 'boolean';
}

initializeGame();
requestAnimationFrame(update);

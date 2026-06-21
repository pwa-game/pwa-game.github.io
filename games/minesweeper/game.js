const LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10, label: '初级' },
  medium: { rows: 12, cols: 12, mines: 22, label: '中级' },
  hard: { rows: 16, cols: 16, mines: 45, label: '高级' }
};
const STATE_KEY = 'pwa-games.minesweeper.state.v1';

const boardEl = document.getElementById('board');
const minesEl = document.getElementById('mines');
const flagsEl = document.getElementById('flags');
const timeEl = document.getElementById('time');
const messageEl = document.getElementById('message');
const flagButton = document.getElementById('flag-mode');
const pauseButton = document.getElementById('pause');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayTextEl = document.getElementById('overlay-text');
const resumeButton = document.getElementById('resume');
const overlayNewButton = document.getElementById('overlay-new');

let levelKey = 'easy';
let config = LEVELS[levelKey];
let cells = [];
let started = false;
let ended = false;
let flagMode = false;
let flags = 0;
let opened = 0;
let seconds = 0;
let timer;
let longPressTimer;
let longPressFlagged = false;
let paused = false;
let pendingRestore = false;

function newGame() {
  clearSavedState();
  config = LEVELS[levelKey];
  cells = Array.from({ length: config.rows * config.cols }, (_, index) => ({
    index,
    row: Math.floor(index / config.cols),
    col: index % config.cols,
    mine: false,
    open: false,
    flagged: false,
    n: 0
  }));
  started = false;
  ended = false;
  paused = false;
  pendingRestore = false;
  flags = 0;
  opened = 0;
  seconds = 0;
  clearInterval(timer);
  overlayEl.classList.add('hidden');
  pauseButton.textContent = '暂停';
  boardEl.style.setProperty('--cols', config.cols);
  boardEl.style.setProperty('--rows', config.rows);
  boardEl.dataset.level = levelKey;
  minesEl.textContent = String(config.mines);
  messageEl.textContent = '首次点击一定安全。手机可用插旗模式或长按插旗。';
  updateStats();
  render();
}

function initializeGame() {
  const saved = loadSavedState();
  if (saved) {
    applyState(saved);
    showRestorePrompt(saved);
  } else {
    newGame();
  }
}

function start(firstIndex) {
  placeMines(firstIndex);
  computeNumbers();
  started = true;
  startTimer();
  persistState();
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (paused || ended) return;
    seconds += 1;
    timeEl.textContent = String(seconds);
    persistState();
  }, 1000);
}

function placeMines(firstIndex) {
  const safe = new Set([firstIndex, ...neighbors(firstIndex).map((cell) => cell.index)]);
  const candidates = cells.filter((cell) => !safe.has(cell.index));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.slice(0, config.mines).forEach((cell) => {
    cell.mine = true;
  });
}

function computeNumbers() {
  cells.forEach((cell) => {
    cell.n = neighbors(cell.index).filter((neighbor) => neighbor.mine).length;
  });
}

function neighbors(index) {
  const cell = cells[index];
  const result = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = cell.row + dr;
      const col = cell.col + dc;
      if (row >= 0 && col >= 0 && row < config.rows && col < config.cols) {
        result.push(cells[row * config.cols + col]);
      }
    }
  }
  return result;
}

function reveal(index) {
  if (ended || paused || pendingRestore) return;
  const cell = cells[index];
  if (!cell || cell.open || cell.flagged) return;
  if (!started) start(index);
  if (cell.mine) {
    cell.open = true;
    end(false);
    return;
  }
  floodOpen(index);
  if (opened === cells.length - config.mines) end(true);
  render();
  persistState();
}

function floodOpen(index) {
  const stack = [cells[index]];
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell || cell.open || cell.flagged) continue;
    cell.open = true;
    opened += 1;
    if (cell.n === 0) {
      neighbors(cell.index).forEach((neighbor) => {
        if (!neighbor.open && !neighbor.flagged && !neighbor.mine) stack.push(neighbor);
      });
    }
  }
}

function toggleFlag(index) {
  if (ended || paused || pendingRestore) return;
  const cell = cells[index];
  if (!cell || cell.open) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  messageEl.textContent = cell.flagged ? '已插旗。' : '已取消旗标。';
  updateStats();
  render();
  persistState();
}

function end(win) {
  ended = true;
  paused = false;
  clearInterval(timer);
  clearSavedState();
  overlayEl.classList.add('hidden');
  if (win) {
    cells.forEach((cell) => {
      if (cell.mine) cell.flagged = true;
    });
    flags = config.mines;
    messageEl.textContent = `完成！用时 ${seconds} 秒。`;
  } else {
    cells.forEach((cell) => {
      if (cell.mine) cell.open = true;
    });
    messageEl.textContent = '踩雷了，点击新局再来。';
  }
  updateStats();
  render();
}

function updateStats() {
  flagsEl.textContent = String(flags);
  timeEl.textContent = String(seconds);
}

function render() {
  boardEl.innerHTML = '';
  cells.forEach((cell) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['mine-cell', cell.open ? 'open' : '', cell.flagged ? 'flagged' : '', cell.mine && cell.open ? 'mine' : ''].join(' ');
    button.dataset.index = String(cell.index);
    if (cell.open) {
      button.textContent = cell.mine ? '＊' : cell.n ? String(cell.n) : '';
      if (cell.n) button.dataset.n = String(cell.n);
    } else {
      button.textContent = cell.flagged ? '⚑' : '';
    }
    button.addEventListener('click', () => {
      if (longPressFlagged) {
        longPressFlagged = false;
        return;
      }
      if (flagMode) toggleFlag(cell.index);
      else reveal(cell.index);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      toggleFlag(cell.index);
    });
    button.addEventListener('pointerdown', () => {
      if (paused || pendingRestore) return;
      longPressFlagged = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressFlagged = true;
        toggleFlag(cell.index);
      }, 430);
    });
    button.addEventListener('pointerup', () => clearTimeout(longPressTimer));
    button.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
    boardEl.appendChild(button);
  });
}

document.getElementById('new-game').addEventListener('click', newGame);
flagButton.addEventListener('click', () => {
  if (pendingRestore) return;
  flagMode = !flagMode;
  flagButton.classList.toggle('primary', flagMode);
  messageEl.textContent = flagMode ? '插旗模式：点击格子放旗。' : '翻开模式：点击格子打开。';
});

boardEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.querySelectorAll('.mode-button[data-level]').forEach((button) => {
  button.addEventListener('click', () => {
    if (pendingRestore) return;
    levelKey = button.dataset.level;
    setActiveLevelButton();
    newGame();
  });
});

pauseButton.addEventListener('click', () => togglePause());
resumeButton.addEventListener('click', () => {
  if (pendingRestore) {
    pendingRestore = false;
    paused = false;
    pauseButton.textContent = '暂停';
    overlayEl.classList.add('hidden');
    messageEl.textContent = '已恢复上次扫雷。';
    if (started) startTimer();
    persistState();
    return;
  }
  togglePause(false);
});
overlayNewButton.addEventListener('click', newGame);

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autoPauseAndSave();
});
window.addEventListener('pagehide', autoPauseAndSave);

function togglePause(force) {
  if (ended || pendingRestore) return;
  if (!started) {
    messageEl.textContent = '先点开第一格，再暂停当前局。';
    return;
  }
  paused = force == null ? !paused : force;
  pauseButton.textContent = paused ? '继续' : '暂停';
  if (paused) {
    clearInterval(timer);
    showOverlay('暂停', '按继续回到游戏。');
  } else {
    overlayEl.classList.add('hidden');
    startTimer();
  }
  persistState();
}

function autoPauseAndSave() {
  if (!started || ended || pendingRestore) return;
  paused = true;
  clearInterval(timer);
  pauseButton.textContent = '继续';
  showOverlay('暂停', '已自动暂停，按继续回到游戏。');
  persistState();
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
  showOverlay('继续上次游戏？', `${LEVELS[saved.levelKey].label} · ${saved.seconds} 秒`);
  messageEl.textContent = '发现未结束的扫雷。';
}

function applyState(state) {
  levelKey = state.levelKey;
  config = LEVELS[levelKey];
  cells = state.cells.map((cell, index) => ({
    index,
    row: Math.floor(index / config.cols),
    col: index % config.cols,
    mine: Boolean(cell.mine),
    open: Boolean(cell.open),
    flagged: Boolean(cell.flagged),
    n: cell.n
  }));
  started = true;
  ended = false;
  paused = true;
  flags = state.flags;
  opened = state.opened;
  seconds = state.seconds;
  clearInterval(timer);
  boardEl.style.setProperty('--cols', config.cols);
  boardEl.style.setProperty('--rows', config.rows);
  boardEl.dataset.level = levelKey;
  minesEl.textContent = String(config.mines);
  setActiveLevelButton();
  updateStats();
  render();
}

function persistState() {
  if (!started || ended) {
    clearSavedState();
    return;
  }
  const state = {
    levelKey,
    flags,
    opened,
    seconds,
    cells: cells.map((cell) => ({
      mine: cell.mine,
      open: cell.open,
      flagged: cell.flagged,
      n: cell.n
    }))
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
    const level = LEVELS[state.levelKey];
    if (!level || !Array.isArray(state.cells) || state.cells.length !== level.rows * level.cols) return undefined;
    if (!Number.isFinite(state.flags) || !Number.isFinite(state.opened) || !Number.isFinite(state.seconds)) return undefined;
    if (!state.cells.every(isValidSavedCell)) return undefined;
    return {
      levelKey: state.levelKey,
      flags: Math.max(0, Math.floor(state.flags)),
      opened: Math.max(0, Math.floor(state.opened)),
      seconds: Math.max(0, Math.floor(state.seconds)),
      cells: state.cells
    };
  } catch {
    clearSavedState();
    return undefined;
  }
}

function isValidSavedCell(cell) {
  return cell &&
    typeof cell.mine === 'boolean' &&
    typeof cell.open === 'boolean' &&
    typeof cell.flagged === 'boolean' &&
    Number.isInteger(cell.n) &&
    cell.n >= 0 &&
    cell.n <= 8;
}

function setActiveLevelButton() {
  document.querySelectorAll('.mode-button[data-level]').forEach((item) => {
    item.classList.toggle('active', item.dataset.level === levelKey);
  });
}

initializeGame();

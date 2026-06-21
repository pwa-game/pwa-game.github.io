(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);

  function baseRuntime(options) {
    const canvas = $('board');
    const ctx = canvas.getContext('2d');
    const scoreEl = $('score');
    const bestEl = $('best');
    const auxEl = $('aux');
    const stateEl = $('state');
    const messageEl = $('message');
    const pauseButton = $('pause');
    const newButton = $('new-game');
    const overlayEl = $('overlay');
    const overlayTitleEl = $('overlay-title');
    const overlayTextEl = $('overlay-text');
    const resumeButton = $('resume');
    const overlayNewButton = $('overlay-new');
    const bestKey = options.bestKey;
    let best = Number(localStorage.getItem(bestKey) || 0);

    function updateStats(score, aux, state) {
      if (scoreEl) scoreEl.textContent = String(score);
      if (bestEl) bestEl.textContent = String(best);
      if (auxEl) auxEl.textContent = String(aux);
      if (stateEl) stateEl.textContent = state;
    }

    function updateBest(score) {
      if (score > best) {
        best = score;
        localStorage.setItem(bestKey, String(best));
      }
      if (bestEl) bestEl.textContent = String(best);
    }

    function showOverlay(title, text) {
      overlayTitleEl.textContent = title;
      overlayTextEl.textContent = text;
      overlayEl.classList.remove('hidden');
    }

    function hideOverlay() {
      overlayEl.classList.add('hidden');
    }

    function bindControls(game) {
      pauseButton.addEventListener('click', () => game.togglePause());
      newButton.addEventListener('click', () => game.reset());
      resumeButton.addEventListener('click', () => game.togglePause(false));
      overlayNewButton.addEventListener('click', () => game.reset());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) game.togglePause(true);
      });
    }

    return {
      canvas,
      ctx,
      messageEl,
      pauseButton,
      resumeButton,
      updateStats,
      updateBest,
      showOverlay,
      hideOverlay,
      bindControls,
      get best() {
        return best;
      }
    };
  }

  function resizeCanvasToDisplay(canvas, ctx) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function startDepthDrop() {
    const runtime = baseRuntime({ bestKey: 'pwa-games.depth-drop.best' });
    const { canvas, ctx } = runtime;
    let player;
    let platforms;
    let score;
    let nextPlatformDepth;
    let started;
    let running;
    let paused;
    let gameOver;
    let lastTime;
    let animationFrame;
    let keys = { left: false, right: false };
    let dragX;

    function reset() {
      cancelAnimationFrame(animationFrame);
      const size = resizeCanvasToDisplay(canvas, ctx);
      player = { x: size.width / 2, y: Math.min(150, size.height * 0.32), width: 26, height: 30, vx: 0, vy: 0 };
      platforms = [];
      nextPlatformDepth = 1;
      const safeY = player.y + player.height / 2 + 18;
      platforms.push({
        x: clamp(size.width / 2 - 82, 8, size.width - 172),
        y: safeY,
        width: 164,
        height: 12,
        type: 'safe',
        depth: 0,
        touched: false,
        breakTimer: 0
      });
      let y = safeY + 72;
      while (y < size.height + 140) {
        appendPlatform(size, y);
        y += rand(58, 84);
      }
      score = 0;
      started = false;
      running = true;
      paused = true;
      gameOver = false;
      lastTime = 0;
      dragX = undefined;
      runtime.pauseButton.textContent = '开始';
      runtime.resumeButton.textContent = '开始';
      runtime.showOverlay('准备', '左右移动，平台会向上升，找下一层往下落。');
      runtime.messageEl.textContent = '按开始后再动，不会开局读秒就死。';
      runtime.updateStats(score, '0层', '准备');
      animationFrame = requestAnimationFrame(loop);
    }

    function appendPlatform(size, y) {
      const forceNormal = needsStablePlatform(y);
      platforms.push(makePlatform(size, y, nextPlatformDepth, forceNormal ? 'normal' : undefined));
      nextPlatformDepth += 1;
    }

    function makePlatform(size, y, depth, forcedType) {
      const type = forcedType || choosePlatformType(depth);
      const maxWidth = type === 'normal' ? 146 : Math.max(108, 138 - Math.min(18, depth * 0.35));
      const minWidth = type === 'normal' ? 96 : 88;
      const width = rand(minWidth, maxWidth);
      return {
        x: rand(8, size.width - width - 8),
        y,
        width,
        height: 12,
        type,
        depth,
        touched: false,
        breakTimer: 0
      };
    }

    function needsStablePlatform(nextY) {
      const stablePlatforms = platforms.filter((platform) => isStablePlatform(platform));
      if (!stablePlatforms.length) return true;
      const lastStableY = Math.max(...stablePlatforms.map((platform) => platform.y));
      return nextY - lastStableY > 136;
    }

    function isStablePlatform(platform) {
      return platform.type === 'safe' || platform.type === 'normal';
    }

    function extendPlatforms(size) {
      let lastY = platforms.length ? platforms[platforms.length - 1].y : player.y + 80;
      while (lastY < size.height + 150) {
        lastY += rand(56, 78);
        appendPlatform(size, lastY);
      }
    }

    function choosePlatformType(depth) {
      if (depth < 8) return 'normal';
      const breakChance = clamp(0.05 + (depth - 8) * 0.006, 0.05, 0.18);
      const spikeChance = depth < 22 ? 0 : clamp(0.04 + (depth - 22) * 0.004, 0.04, 0.14);
      const roll = Math.random();
      if (roll < spikeChance) return 'spike';
      if (roll < spikeChance + breakChance) return 'break';
      return 'normal';
    }

    function loop(time) {
      const size = resizeCanvasToDisplay(canvas, ctx);
      const delta = Math.min(34, time - lastTime || 16);
      lastTime = time;
      if (running && started && !paused && !gameOver) update(delta, size);
      draw(size);
      if (running) animationFrame = requestAnimationFrame(loop);
    }

    function update(delta, size) {
      const step = delta / 16;
      const speed = 1.08 + Math.min(2.45, score * 0.008);
      platforms.forEach((platform) => {
        platform.y -= speed * step;
      });
      while (platforms.length && platforms[0].y < -28) {
        platforms.shift();
        score += 1;
        runtime.updateBest(score);
      }
      const input = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      if (dragX != null) {
        player.vx += clamp((dragX - player.x) * 0.065, -1.65, 1.65);
      } else {
        player.vx += input * 0.48;
      }
      player.vx *= 0.86;
      player.x += player.vx * step;
      if (player.x < -player.width) player.x = size.width + player.width;
      if (player.x > size.width + player.width) player.x = -player.width;
      const oldBottom = player.y + player.height / 2;
      player.vy += 0.34 * step;
      player.y += player.vy * step;
      const newBottom = player.y + player.height / 2;
      platforms.forEach((platform) => {
        if (gameOver) return;
        if (
          player.vy >= 0 &&
          oldBottom <= platform.y + speed * step + 5 &&
          newBottom >= platform.y &&
          player.x + player.width / 2 > platform.x &&
          player.x - player.width / 2 < platform.x + platform.width
        ) {
          if (platform.type === 'spike') {
            endGame('踩到锯齿台阶。');
            return;
          }
          player.y = platform.y - player.height / 2;
          player.vy = 0;
          platform.touched = true;
          if (platform.type === 'break' && platform.breakTimer === 0) platform.breakTimer = 18;
        }
      });
      platforms.forEach((platform) => {
        if (platform.breakTimer > 0) {
          platform.breakTimer -= step;
          if (platform.breakTimer <= 0) platform.dead = true;
        }
      });
      platforms = platforms.filter((platform) => !platform.dead);
      extendPlatforms(size);
      if (player.y < -32 || player.y > size.height + 54) endGame();
      runtime.updateStats(score, `${score}层`, gameOver ? '结束' : '进行');
    }

    function draw(size) {
      const gradient = ctx.createLinearGradient(0, 0, 0, size.height);
      gradient.addColorStop(0, '#0f2538');
      gradient.addColorStop(1, '#122719');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 12; i += 1) ctx.fillRect((i * 47 + score * 11) % size.width, i * 53 % size.height, 2, 18);
      platforms.forEach((platform) => {
        ctx.globalAlpha = platform.breakTimer > 0 ? 0.55 + Math.sin(platform.breakTimer) * 0.16 : 1;
        ctx.fillStyle = platform.type === 'safe' ? '#79d6ff' : platform.type === 'break' ? '#f06b56' : platform.type === 'spike' ? '#9c7bff' : '#78d68f';
        roundRect(ctx, platform.x, platform.y, platform.width, platform.height, 6);
        ctx.fill();
        if (platform.type === 'break') {
          ctx.strokeStyle = 'rgba(255,255,255,0.42)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(platform.x + platform.width * 0.38, platform.y + 2);
          ctx.lineTo(platform.x + platform.width * 0.48, platform.y + platform.height - 2);
          ctx.lineTo(platform.x + platform.width * 0.62, platform.y + 3);
          ctx.stroke();
        } else if (platform.type === 'spike') {
          ctx.fillStyle = '#fff8e6';
          const toothCount = Math.max(4, Math.floor(platform.width / 18));
          const toothWidth = platform.width / toothCount;
          ctx.beginPath();
          for (let i = 0; i < toothCount; i += 1) {
            const left = platform.x + i * toothWidth;
            ctx.moveTo(left + 2, platform.y);
            ctx.lineTo(left + toothWidth / 2, platform.y - 9);
            ctx.lineTo(left + toothWidth - 2, platform.y);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      ctx.fillStyle = '#ffb133';
      roundRect(ctx, player.x - player.width / 2, player.y - player.height / 2, player.width, player.height, 8);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.fillRect(player.x - 7, player.y - 5, 4, 4);
      ctx.fillRect(player.x + 4, player.y - 5, 4, 4);
      if (!started && !gameOver) shade(ctx, size, '准备');
      if ((paused && started) || gameOver) shade(ctx, size, gameOver ? '游戏结束' : '暂停');
    }

    function begin() {
      if (gameOver) return;
      started = true;
      paused = false;
      runtime.pauseButton.textContent = '暂停';
      runtime.resumeButton.textContent = '继续';
      runtime.hideOverlay();
      runtime.messageEl.textContent = '普通台阶先出现，裂板和锯齿台阶会逐渐加入。';
      runtime.updateStats(score, `${score}层`, '进行');
    }

    function endGame(reason) {
      gameOver = true;
      running = false;
      runtime.updateBest(score);
      runtime.messageEl.textContent = reason || `下到 ${score} 层。`;
      runtime.updateStats(score, `${score}层`, '结束');
      runtime.showOverlay('游戏结束', reason ? `${reason} 本局 ${score} 层。` : `本局 ${score} 层。`);
    }

    const game = {
      reset,
      togglePause(force) {
        if (gameOver) return;
        if (!started) {
          if (force !== true) begin();
          return;
        }
        paused = force == null ? !paused : force;
        runtime.pauseButton.textContent = paused ? '继续' : '暂停';
        paused ? runtime.showOverlay('暂停', '继续下坠。') : runtime.hideOverlay();
      }
    };
    runtime.bindControls(game);
    bindHorizontal(canvas, keys, (x) => {
      if (!started) begin();
      dragX = x;
    }, () => {
      dragX = undefined;
    });
    document.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('pointerdown', () => {
        if (!started) begin();
      });
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') begin();
      if (event.key === 'ArrowLeft') keys.left = true;
      if (event.key === 'ArrowRight') keys.right = true;
      if (event.key === ' ') game.togglePause();
    });
    window.addEventListener('keyup', (event) => {
      if (event.key === 'ArrowLeft') keys.left = false;
      if (event.key === 'ArrowRight') keys.right = false;
    });
    reset();
  }

  function startHelicopter() {
    const runtime = baseRuntime({ bestKey: 'pwa-games.helicopter.best' });
    const { canvas, ctx } = runtime;
    let heli;
    let walls;
    let score;
    let started;
    let running;
    let paused;
    let gameOver;
    let pressed;
    let graceMs;
    let lastTime;
    let animationFrame;

    function reset() {
      cancelAnimationFrame(animationFrame);
      const size = resizeCanvasToDisplay(canvas, ctx);
      heli = { x: size.width * 0.25, y: size.height * 0.5, vy: 0 };
      walls = [];
      score = 0;
      for (let i = 0; i < 18; i += 1) walls.push(makeWall(size, size.width * 0.64 + i * 46));
      started = false;
      running = true;
      paused = true;
      gameOver = false;
      pressed = false;
      graceMs = 1400;
      lastTime = 0;
      runtime.showOverlay('准备', '点住画面起飞，松开下降。前一秒不会撞墙。');
      runtime.pauseButton.textContent = '开始';
      runtime.resumeButton.textContent = '开始';
      runtime.messageEl.textContent = '先按开始或点住画面，再进入飞行。';
      runtime.updateStats(0, '0m', '准备');
      animationFrame = requestAnimationFrame(loop);
    }

    function makeWall(size, x) {
      const previous = walls[walls.length - 1];
      const center = clamp((previous ? previous.center : size.height * 0.5) + rand(-30, 30), 108, size.height - 108);
      const gap = clamp(196 - score * 0.025, 128, 196);
      return { x, center, gap, width: 42 };
    }

    function loop(time) {
      const size = resizeCanvasToDisplay(canvas, ctx);
      const delta = Math.min(34, time - lastTime || 16);
      lastTime = time;
      if (running && started && !paused && !gameOver) update(delta, size);
      draw(size);
      if (running) animationFrame = requestAnimationFrame(loop);
    }

    function update(delta, size) {
      const step = delta / 16;
      const speed = 1.75 + Math.min(3, score * 0.009);
      const wasGrace = graceMs > 0;
      heli.vy += (pressed ? -0.26 : 0.23) * step;
      heli.vy = clamp(heli.vy, -4.6, 5.5);
      heli.y += heli.vy * step;
      if (graceMs > 0) {
        graceMs -= delta;
        heli.y = clamp(heli.y, 26, size.height - 26);
      }
      if (wasGrace && graceMs <= 0) {
        heli.y = clamp(heli.y, size.height * 0.34, size.height * 0.66);
        heli.vy = 0;
      }
      walls.forEach((wall) => {
        wall.x -= speed * step;
      });
      while (walls.length && walls[0].x + walls[0].width < -4) {
        walls.shift();
        walls.push(makeWall(size, walls[walls.length - 1].x + 46));
        score += 1;
        runtime.updateBest(score);
      }
      const hit = graceMs <= 0 && walls.some((wall) => {
        const inX = heli.x + 16 > wall.x && heli.x - 16 < wall.x + wall.width;
        if (!inX) return false;
        return heli.y - 12 < wall.center - wall.gap / 2 || heli.y + 12 > wall.center + wall.gap / 2;
      });
      if (hit || (graceMs <= 0 && (heli.y < 12 || heli.y > size.height - 12))) endGame();
      runtime.updateStats(score, `${score}m`, gameOver ? '结束' : '飞行');
    }

    function draw(size) {
      ctx.fillStyle = '#081624';
      ctx.fillRect(0, 0, size.width, size.height);
      walls.forEach((wall) => {
        ctx.fillStyle = '#295047';
        ctx.fillRect(wall.x, 0, wall.width, wall.center - wall.gap / 2);
        ctx.fillRect(wall.x, wall.center + wall.gap / 2, wall.width, size.height);
        ctx.fillStyle = '#69d39a';
        ctx.fillRect(wall.x, wall.center - wall.gap / 2 - 3, wall.width, 3);
        ctx.fillRect(wall.x, wall.center + wall.gap / 2, wall.width, 3);
      });
      ctx.save();
      ctx.translate(heli.x, heli.y);
      ctx.rotate(clamp(heli.vy / 12, -0.35, 0.48));
      ctx.fillStyle = '#ffd95a';
      roundRect(ctx, -18, -9, 34, 18, 8);
      ctx.fill();
      ctx.fillStyle = '#ff7a30';
      ctx.fillRect(12, -3, 19, 6);
      ctx.fillStyle = '#dff7ff';
      ctx.fillRect(-8, -6, 10, 6);
      ctx.restore();
      if (started && graceMs > 0 && !paused && !gameOver) {
        ctx.fillStyle = 'rgba(255, 217, 90, 0.82)';
        ctx.font = '900 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('起飞缓冲', size.width / 2, 34);
      }
      if (!started && !gameOver) shade(ctx, size, '准备');
      if ((paused && started) || gameOver) shade(ctx, size, gameOver ? '坠毁' : '暂停');
    }

    function begin() {
      if (gameOver) return;
      started = true;
      paused = false;
      runtime.pauseButton.textContent = '暂停';
      runtime.resumeButton.textContent = '继续';
      runtime.hideOverlay();
      runtime.messageEl.textContent = '按住上升，松开下降；通道会逐渐变窄。';
      runtime.updateStats(score, `${score}m`, '飞行');
    }

    function endGame() {
      gameOver = true;
      running = false;
      runtime.updateBest(score);
      runtime.messageEl.textContent = `飞行 ${score}m。`;
      runtime.showOverlay('游戏结束', `本局 ${score}m。`);
    }

    const game = {
      reset,
      togglePause(force) {
        if (gameOver) return;
        if (!started) {
          if (force !== true) begin();
          return;
        }
        paused = force == null ? !paused : force;
        runtime.pauseButton.textContent = paused ? '继续' : '暂停';
        paused ? runtime.showOverlay('暂停', '按继续回到飞行。') : runtime.hideOverlay();
      }
    };
    runtime.bindControls(game);
    const press = (event) => {
      event.preventDefault();
      if (!started) begin();
      pressed = true;
    };
    const release = (event) => {
      event.preventDefault();
      pressed = false;
    };
    canvas.addEventListener('pointerdown', press);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        if (!started) begin();
        pressed = true;
      }
    });
    window.addEventListener('keyup', (event) => {
      if (event.key === ' ') pressed = false;
    });
    reset();
  }

  function startBrickBreaker() {
    const runtime = baseRuntime({ bestKey: 'pwa-games.brick-breaker.best' });
    const { canvas, ctx } = runtime;
    let paddle;
    let balls;
    let bricks;
    let powerups;
    let score;
    let level;
    let lives;
    let launched;
    let wideUntil;
    let slowUntil;
    let running;
    let paused;
    let gameOver;
    let lastTime;
    let animationFrame;

    function reset() {
      cancelAnimationFrame(animationFrame);
      score = 0;
      level = 1;
      lives = 3;
      wideUntil = 0;
      slowUntil = 0;
      running = true;
      paused = false;
      gameOver = false;
      runtime.hideOverlay();
      runtime.pauseButton.textContent = '暂停';
      startLevel();
      animationFrame = requestAnimationFrame(loop);
    }

    function startLevel() {
      const size = resizeCanvasToDisplay(canvas, ctx);
      paddle = { x: size.width / 2, y: size.height - 34, width: currentPaddleWidth(), height: 12 };
      balls = [makeBall()];
      powerups = [];
      launched = false;
      bricks = [];
      const cols = 7;
      const rows = Math.min(7, 4 + level);
      const gap = 5;
      const bw = (size.width - 28 - (cols - 1) * gap) / cols;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          bricks.push({ x: 14 + x * (bw + gap), y: 54 + y * 22, width: bw, height: 15, hp: y < 2 && level > 2 ? 2 : 1 });
        }
      }
      lastTime = 0;
      runtime.messageEl.textContent = '拖动球拍，点一下画面发球。';
      runtime.updateStats(score, `L${level} / ${lives}`, '待发');
    }

    function currentPaddleWidth() {
      return wideUntil > 0 ? 124 : 86;
    }

    function makeBall() {
      return {
        x: paddle.x,
        y: paddle.y - 14,
        vx: rand(-2.1, 2.1) || 1.5,
        vy: -4.1 - level * 0.18,
        r: 8
      };
    }

    function launch() {
      if (gameOver || paused || launched) return;
      launched = true;
      runtime.messageEl.textContent = '接住掉落道具：W 变宽，S 慢球，+ 加命。';
    }

    function loop(time) {
      const size = resizeCanvasToDisplay(canvas, ctx);
      const delta = Math.min(34, time - lastTime || 16);
      lastTime = time;
      if (running && !paused && !gameOver) update(delta, size);
      draw(size);
      if (running) animationFrame = requestAnimationFrame(loop);
    }

    function update(delta, size) {
      const step = delta / 16;
      wideUntil = Math.max(0, wideUntil - delta);
      slowUntil = Math.max(0, slowUntil - delta);
      paddle.width = currentPaddleWidth();
      paddle.x = clamp(paddle.x, paddle.width / 2, size.width - paddle.width / 2);
      if (!launched) {
        balls.forEach((ball) => {
          ball.x = paddle.x;
          ball.y = paddle.y - 14;
        });
        runtime.updateStats(score, `L${level} / ${lives}`, '待发');
        return;
      }
      const speedScale = slowUntil > 0 ? 0.72 : 1;
      balls.forEach((ball) => {
        ball.x += ball.vx * step * speedScale;
        ball.y += ball.vy * step * speedScale;
        if (ball.x < ball.r) {
          ball.x = ball.r;
          ball.vx = Math.abs(ball.vx);
        }
        if (ball.x > size.width - ball.r) {
          ball.x = size.width - ball.r;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y < ball.r) {
          ball.y = ball.r;
          ball.vy = Math.abs(ball.vy);
        }
        if (
          ball.y + ball.r > paddle.y &&
          ball.y - ball.r < paddle.y + paddle.height &&
          ball.x > paddle.x - paddle.width / 2 &&
          ball.x < paddle.x + paddle.width / 2 &&
          ball.vy > 0
        ) {
          const offset = (ball.x - paddle.x) / (paddle.width / 2);
          ball.vx = offset * 4.8;
          ball.vy = -Math.abs(ball.vy) - 0.04;
          ball.y = paddle.y - ball.r;
        }
        for (const brick of bricks) {
          if (brick.dead) continue;
          if (ball.x + ball.r < brick.x || ball.x - ball.r > brick.x + brick.width || ball.y + ball.r < brick.y || ball.y - ball.r > brick.y + brick.height) continue;
          brick.hp -= 1;
          brick.dead = brick.hp <= 0;
          ball.vy *= -1;
          score += 10;
          runtime.updateBest(score);
          if (brick.dead) spawnPowerup(brick);
          break;
        }
      });
      powerups.forEach((powerup) => {
        powerup.y += powerup.vy * step;
        if (
          powerup.y + 10 > paddle.y &&
          powerup.y - 10 < paddle.y + paddle.height &&
          powerup.x > paddle.x - paddle.width / 2 &&
          powerup.x < paddle.x + paddle.width / 2
        ) {
          powerup.dead = true;
          applyPowerup(powerup.type);
        }
        if (powerup.y > size.height + 18) powerup.dead = true;
      });
      balls = balls.filter((ball) => ball.y < size.height + 18);
      powerups = powerups.filter((powerup) => !powerup.dead);
      if (balls.length === 0) {
        lives -= 1;
        if (lives <= 0) {
          endGame();
        } else {
          startLevel();
        }
        return;
      }
      bricks = bricks.filter((brick) => !brick.dead);
      if (bricks.length === 0) {
        level += 1;
        startLevel();
      }
      runtime.updateStats(score, `L${level} / ${lives}`, gameOver ? '结束' : slowUntil > 0 || wideUntil > 0 ? '道具' : '进行');
    }

    function spawnPowerup(brick) {
      if (Math.random() > 0.26) return;
      const types = ['wide', 'slow', 'life'];
      powerups.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        vy: 2.2,
        type: types[Math.floor(Math.random() * types.length)]
      });
    }

    function applyPowerup(type) {
      if (type === 'wide') {
        wideUntil = 8500;
        runtime.messageEl.textContent = '球拍变宽。';
      } else if (type === 'slow') {
        slowUntil = 6200;
        runtime.messageEl.textContent = '慢球道具生效。';
      } else {
        lives = Math.min(5, lives + 1);
        runtime.messageEl.textContent = '额外生命 +1。';
      }
    }

    function draw(size) {
      ctx.fillStyle = '#08121c';
      ctx.fillRect(0, 0, size.width, size.height);
      bricks.forEach((brick) => {
        ctx.fillStyle = brick.hp > 1 ? '#ff775f' : '#ffd95a';
        roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
        ctx.fill();
      });
      powerups.forEach((powerup) => {
        ctx.fillStyle = powerup.type === 'wide' ? '#7fe08f' : powerup.type === 'slow' ? '#79d6ff' : '#ff775f';
        roundRect(ctx, powerup.x - 11, powerup.y - 11, 22, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#08121c';
        ctx.font = '900 14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(powerup.type === 'wide' ? 'W' : powerup.type === 'slow' ? 'S' : '+', powerup.x, powerup.y + 1);
        ctx.textBaseline = 'alphabetic';
      });
      ctx.fillStyle = '#79d6ff';
      roundRect(ctx, paddle.x - paddle.width / 2, paddle.y, paddle.width, paddle.height, 6);
      ctx.fill();
      ctx.fillStyle = '#fff8e6';
      balls.forEach((ball) => {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
      });
      if (!launched && !gameOver && !paused) {
        ctx.fillStyle = 'rgba(255, 217, 90, 0.82)';
        ctx.font = '900 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('点一下发球', size.width / 2, paddle.y - 32);
      }
      if (paused || gameOver) shade(ctx, size, gameOver ? '游戏结束' : '暂停');
    }

    function endGame() {
      gameOver = true;
      running = false;
      runtime.updateBest(score);
      runtime.showOverlay('游戏结束', `本局 ${score} 分。`);
      runtime.messageEl.textContent = `打到第 ${level} 关。`;
    }

    const game = {
      reset,
      togglePause(force) {
        if (gameOver) return;
        paused = force == null ? !paused : force;
        runtime.pauseButton.textContent = paused ? '继续' : '暂停';
        paused ? runtime.showOverlay('暂停', '按继续回到游戏。') : runtime.hideOverlay();
      }
    };
    runtime.bindControls(game);
    bindPointerX(canvas, (x) => {
      const rect = canvas.getBoundingClientRect();
      paddle.x = clamp(x, paddle.width / 2, rect.width - paddle.width / 2);
    });
    canvas.addEventListener('pointerdown', () => launch());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') paddle.x -= 24;
      if (event.key === 'ArrowRight') paddle.x += 24;
      if (event.key === ' ') {
        event.preventDefault();
        launched ? game.togglePause() : launch();
      }
    });
    reset();
  }

  function startSokoban() {
    const runtime = baseRuntime({ bestKey: 'pwa-games.sokoban.best' });
    const { canvas, ctx } = runtime;
    const levels = [
      ['#######', '#  .  #', '#  $  #', '#  @  #', '#######'],
      ['########', '# .  ###', '# $    #', '#  #@  #', '#      #', '########'],
      ['########', '#  ..  #', '#  $$  #', '#   #  #', '#  @   #', '########'],
      ['#########', '#   .   #', '# # $ # #', '#   $ . #', '#  @    #', '#########'],
      ['#########', '# .   . #', '# $$#   #', '#   #$  #', '#   @   #', '#########']
    ];
    let levelIndex = Number(localStorage.getItem('pwa-games.sokoban.level') || 0) % levels.length;
    let map;
    let player;
    let moves;
    let history;
    let touchStart;
    let menuOpen;

    function reset() {
      loadLevel(levelIndex);
    }

    function loadLevel(index) {
      levelIndex = (index + levels.length) % levels.length;
      localStorage.setItem('pwa-games.sokoban.level', String(levelIndex));
      map = [];
      history = [];
      menuOpen = false;
      moves = 0;
      levels[levelIndex].forEach((row, y) => {
        map[y] = [];
        row.split('').forEach((char, x) => {
          if (char === '@') {
            player = { x, y };
            map[y][x] = ' ';
          } else {
            map[y][x] = char;
          }
        });
      });
      runtime.hideOverlay();
      runtime.pauseButton.textContent = '菜单';
      runtime.messageEl.textContent = '把箱子推到所有目标点。';
      updateStats();
      draw();
    }

    function updateStats() {
      const solvedCount = countSolved();
      runtime.updateStats(moves, `${levelIndex + 1}/${levels.length}`, `${solvedCount}/${countTargets()}`);
    }

    function move(dx, dy) {
      const tx = player.x + dx;
      const ty = player.y + dy;
      const target = cell(tx, ty);
      if (target === '#') return;
      if (target === '$' || target === '*') {
        const bx = tx + dx;
        const by = ty + dy;
        const behind = cell(bx, by);
        if (behind === '#' || behind === '$' || behind === '*') return;
        history.push(snapshot());
        setCell(bx, by, behind === '.' ? '*' : '$');
        setCell(tx, ty, target === '*' ? '.' : ' ');
      } else {
        history.push(snapshot());
      }
      player = { x: tx, y: ty };
      moves += 1;
      updateStats();
      draw();
      if (countSolved() === countTargets()) {
        runtime.updateBest(Math.max(runtime.best, levelIndex + 1));
        runtime.showOverlay('过关', '进入下一关。');
        setTimeout(() => loadLevel(levelIndex + 1), 650);
      }
    }

    function snapshot() {
      return {
        map: map.map((row) => row.slice()),
        player: { ...player },
        moves
      };
    }

    function undo() {
      const previous = history.pop();
      if (!previous) {
        runtime.messageEl.textContent = '没有可撤销的步数。';
        return;
      }
      map = previous.map;
      player = previous.player;
      moves = previous.moves;
      runtime.messageEl.textContent = '已撤销一步。';
      updateStats();
      draw();
    }

    function cell(x, y) {
      return map[y]?.[x] ?? '#';
    }

    function setCell(x, y, value) {
      map[y][x] = value;
    }

    function countTargets() {
      return map.flat().filter((cellValue) => cellValue === '.' || cellValue === '*').length;
    }

    function countSolved() {
      return map.flat().filter((cellValue) => cellValue === '*').length;
    }

    function draw() {
      const size = resizeCanvasToDisplay(canvas, ctx);
      ctx.fillStyle = '#091512';
      ctx.fillRect(0, 0, size.width, size.height);
      const rows = map.length;
      const cols = Math.max(...map.map((row) => row.length));
      const tile = Math.floor(Math.min(size.width / cols, size.height / rows));
      const ox = (size.width - cols * tile) / 2;
      const oy = (size.height - rows * tile) / 2;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const value = cell(x, y);
          ctx.fillStyle = value === '#' ? '#263c45' : '#10231f';
          ctx.fillRect(ox + x * tile + 1, oy + y * tile + 1, tile - 2, tile - 2);
          if (value === '.' || value === '*') {
            ctx.fillStyle = '#ffd95a';
            ctx.beginPath();
            ctx.arc(ox + x * tile + tile / 2, oy + y * tile + tile / 2, tile * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
          if (value === '$' || value === '*') {
            ctx.fillStyle = value === '*' ? '#7fe08f' : '#c88742';
            roundRect(ctx, ox + x * tile + tile * 0.18, oy + y * tile + tile * 0.18, tile * 0.64, tile * 0.64, 5);
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = '#ffb133';
      roundRect(ctx, ox + player.x * tile + tile * 0.24, oy + player.y * tile + tile * 0.18, tile * 0.52, tile * 0.66, 7);
      ctx.fill();
    }

    const game = {
      reset,
      togglePause(force) {
        if (force === true) return;
        if (force === false) {
          menuOpen = false;
          runtime.hideOverlay();
          runtime.pauseButton.textContent = '菜单';
          return;
        }
        menuOpen = !menuOpen;
        runtime.pauseButton.textContent = menuOpen ? '关闭' : '菜单';
        if (menuOpen) runtime.showOverlay('菜单', '滑动棋盘移动，撤销和关卡控制在这里。');
        else runtime.hideOverlay();
      }
    };
    runtime.bindControls(game);
    document.querySelectorAll('[data-dir]').forEach((button) => {
      button.addEventListener('click', () => {
        const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        move(...dirs[button.dataset.dir]);
      });
    });
    $('prev-level').addEventListener('click', () => loadLevel(levelIndex - 1));
    $('next-level').addEventListener('click', () => loadLevel(levelIndex + 1));
    $('undo').addEventListener('click', undo);
    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      touchStart = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      event.preventDefault();
      if (!touchStart) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = undefined;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
      else move(0, dy > 0 ? 1 : -1);
    });
    window.addEventListener('keydown', (event) => {
      if ((event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        undo();
        return;
      }
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (!dirs[event.key]) return;
      event.preventDefault();
      move(...dirs[event.key]);
    });
    loadLevel(levelIndex);
  }

  function startSpaceShooter() {
    const runtime = baseRuntime({ bestKey: 'pwa-games.space-shooter.best' });
    const { canvas, ctx } = runtime;
    let player;
    let bullets;
    let enemies;
    let particles;
    let pickups;
    let score;
    let wave;
    let lives;
    let weaponLevel;
    let rapidUntil;
    let shield;
    let invincibleMs;
    let running;
    let paused;
    let gameOver;
    let lastTime;
    let fireTimer;
    let enemyTimer;
    let animationFrame;

    function reset() {
      cancelAnimationFrame(animationFrame);
      const size = resizeCanvasToDisplay(canvas, ctx);
      player = { x: size.width / 2, y: size.height - 54, targetX: size.width / 2, targetY: size.height - 54 };
      bullets = [];
      enemies = [];
      particles = [];
      pickups = [];
      score = 0;
      wave = 1;
      lives = 3;
      weaponLevel = 1;
      rapidUntil = 0;
      shield = 0;
      invincibleMs = 0;
      running = true;
      paused = false;
      gameOver = false;
      lastTime = 0;
      fireTimer = 180;
      enemyTimer = 520;
      runtime.hideOverlay();
      runtime.pauseButton.textContent = '暂停';
      runtime.messageEl.textContent = '拖动飞船，捡火力、急速、护盾和生命道具。';
      runtime.updateStats(score, `W${wave} / ${lives}`, '火力1');
      animationFrame = requestAnimationFrame(loop);
    }

    function loop(time) {
      const size = resizeCanvasToDisplay(canvas, ctx);
      const delta = Math.min(34, time - lastTime || 16);
      lastTime = time;
      if (running && !paused && !gameOver) update(delta, size);
      draw(size);
      if (running) animationFrame = requestAnimationFrame(loop);
    }

    function update(delta, size) {
      const step = delta / 16;
      player.targetX = clamp(player.targetX, 18, size.width - 18);
      player.targetY = clamp(player.targetY, size.height * 0.48, size.height - 34);
      player.x += (player.targetX - player.x) * 0.22;
      player.y += (player.targetY - player.y) * 0.18;
      rapidUntil = Math.max(0, rapidUntil - delta);
      invincibleMs = Math.max(0, invincibleMs - delta);
      fireTimer -= delta;
      if (fireTimer <= 0) {
        fireBullets();
        fireTimer = rapidUntil > 0 ? 105 : Math.max(150, 250 - wave * 6);
      }
      enemyTimer -= delta;
      if (enemyTimer <= 0) {
        enemies.push(makeEnemy(size));
        enemyTimer = rand(0.82, 1.18) * Math.max(360, 800 - wave * 34);
      }
      bullets.forEach((bullet) => {
        bullet.y += bullet.vy * step;
        bullet.x += bullet.vx * step;
      });
      enemies.forEach((enemy) => {
        enemy.age += delta;
        enemy.y += enemy.vy * step;
        if (enemy.type === 'zigzag') enemy.x = enemy.baseX + Math.sin(enemy.age / 300 + enemy.phase) * enemy.swing;
      });
      bullets.forEach((bullet) => {
        enemies.forEach((enemy) => {
          if (enemy.dead || bullet.dead) return;
          if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.r + 6) {
            bullet.dead = true;
            enemy.hp -= bullet.damage;
            if (enemy.hp <= 0) {
              enemy.dead = true;
              score += enemy.points;
              wave = Math.floor(score / 180) + 1;
              runtime.updateBest(score);
              spawnPickup(enemy);
              for (let i = 0; i < 8; i += 1) particles.push({ x: enemy.x, y: enemy.y, vx: rand(-2, 2), vy: rand(-2, 2), life: 22 });
            }
          }
        });
      });
      pickups.forEach((pickup) => {
        pickup.y += pickup.vy * step;
        if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < 28) {
          pickup.dead = true;
          applyPickup(pickup.type);
        }
        if (pickup.y > size.height + 24) pickup.dead = true;
      });
      enemies.forEach((enemy) => {
        if (enemy.dead) return;
        if (invincibleMs <= 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.r + 17) {
          enemy.dead = true;
          takeHit();
        } else if (enemy.y > size.height + 40) {
          enemy.dead = true;
        }
      });
      particles.forEach((particle) => {
        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        particle.life -= step;
      });
      bullets = bullets.filter((bullet) => !bullet.dead && bullet.y > -16);
      enemies = enemies.filter((enemy) => !enemy.dead && enemy.y < size.height + 40);
      pickups = pickups.filter((pickup) => !pickup.dead);
      particles = particles.filter((particle) => particle.life > 0);
      const status = shield > 0 ? '护盾' : rapidUntil > 0 ? '急速' : `火力${weaponLevel}`;
      runtime.updateStats(score, `W${wave} / ${lives}`, gameOver ? '结束' : status);
    }

    function fireBullets() {
      const patterns = weaponLevel === 1
        ? [{ ox: 0, vx: 0 }]
        : weaponLevel === 2
          ? [{ ox: -8, vx: -0.35 }, { ox: 8, vx: 0.35 }]
          : [{ ox: 0, vx: 0 }, { ox: -12, vx: -1.05 }, { ox: 12, vx: 1.05 }];
      patterns.forEach((shot) => {
        bullets.push({ x: player.x + shot.ox, y: player.y - 24, vx: shot.vx, vy: -8.5, damage: 1 });
      });
    }

    function makeEnemy(size) {
      const roll = Math.random();
      const x = rand(26, size.width - 26);
      if (wave >= 4 && roll < 0.22) {
        return { type: 'tank', x, y: -30, vy: 0.95 + wave * 0.04, hp: 4, maxHp: 4, r: 22, points: 35, age: 0 };
      }
      if (wave >= 2 && roll < 0.55) {
        return { type: 'zigzag', x, baseX: x, y: -26, vy: 1.25 + wave * 0.06, hp: 2, maxHp: 2, r: 17, points: 20, age: 0, phase: rand(0, Math.PI * 2), swing: rand(24, 54) };
      }
      if (wave >= 3 && roll > 0.78) {
        return { type: 'fast', x, y: -24, vy: 2 + wave * 0.07, hp: 1, maxHp: 1, r: 14, points: 15, age: 0 };
      }
      return { type: 'scout', x, y: -24, vy: 1.45 + wave * 0.07, hp: 1, maxHp: 1, r: 15, points: 10, age: 0 };
    }

    function spawnPickup(enemy) {
      if (Math.random() > 0.22) return;
      const roll = Math.random();
      const type = roll < 0.42 && weaponLevel < 3 ? 'weapon' : roll < 0.66 ? 'rapid' : roll < 0.88 ? 'shield' : 'life';
      pickups.push({ x: enemy.x, y: enemy.y, vy: 1.65, type });
    }

    function applyPickup(type) {
      if (type === 'weapon') {
        weaponLevel = Math.min(3, weaponLevel + 1);
        runtime.messageEl.textContent = `火力提升到 ${weaponLevel}。`;
      } else if (type === 'rapid') {
        rapidUntil = 7600;
        runtime.messageEl.textContent = '急速射击启动。';
      } else if (type === 'shield') {
        shield = Math.min(2, shield + 1);
        runtime.messageEl.textContent = '获得护盾。';
      } else {
        lives = Math.min(5, lives + 1);
        runtime.messageEl.textContent = '额外生命 +1。';
      }
    }

    function takeHit() {
      if (gameOver) return;
      invincibleMs = 900;
      if (shield > 0) {
        shield -= 1;
        runtime.messageEl.textContent = '护盾抵消一次撞击。';
        return;
      }
      lives -= 1;
      weaponLevel = Math.max(1, weaponLevel - 1);
      runtime.messageEl.textContent = '被击中，火力下降。';
      if (lives <= 0) endGame();
    }

    function draw(size) {
      ctx.fillStyle = '#07111f';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      for (let i = 0; i < 36; i += 1) ctx.fillRect((i * 41 + score * 3) % size.width, (i * 67 + score * 1.7) % size.height, 2, 2);
      bullets.forEach((bullet) => {
        ctx.fillStyle = '#8fe8ff';
        ctx.fillRect(bullet.x - 2, bullet.y - 10, 4, 14);
      });
      enemies.forEach((enemy) => {
        drawEnemy(enemy);
      });
      pickups.forEach((pickup) => drawPickup(pickup));
      particles.forEach((particle) => {
        ctx.fillStyle = '#ffd95a';
        ctx.fillRect(particle.x, particle.y, 3, 3);
      });
      ctx.fillStyle = '#57d6a2';
      ctx.globalAlpha = invincibleMs > 0 ? 0.55 + Math.sin(invincibleMs / 60) * 0.22 : 1;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 24);
      ctx.lineTo(player.x - 18, player.y + 18);
      ctx.lineTo(player.x, player.y + 9);
      ctx.lineTo(player.x + 18, player.y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      if (shield > 0) {
        ctx.strokeStyle = '#79d6ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 27, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (paused || gameOver) shade(ctx, size, gameOver ? '游戏结束' : '暂停');
    }

    function drawEnemy(enemy) {
      ctx.fillStyle = enemy.type === 'tank' ? '#ff775f' : enemy.type === 'zigzag' ? '#ffd95a' : enemy.type === 'fast' ? '#7fe08f' : '#9c7bff';
      if (enemy.type === 'tank') {
        roundRect(ctx, enemy.x - 20, enemy.y - 14, 40, 28, 8);
        ctx.fill();
      } else if (enemy.type === 'zigzag') {
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y - 18);
        ctx.lineTo(enemy.x + 18, enemy.y);
        ctx.lineTo(enemy.x, enemy.y + 18);
        ctx.lineTo(enemy.x - 18, enemy.y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y + 16);
        ctx.lineTo(enemy.x - 16, enemy.y - 12);
        ctx.lineTo(enemy.x + 16, enemy.y - 12);
        ctx.closePath();
        ctx.fill();
      }
      if (enemy.maxHp > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(enemy.x - 18, enemy.y + enemy.r + 5, 36, 4);
        ctx.fillStyle = '#fff8e6';
        ctx.fillRect(enemy.x - 18, enemy.y + enemy.r + 5, 36 * (enemy.hp / enemy.maxHp), 4);
      }
    }

    function drawPickup(pickup) {
      const colors = { weapon: '#ffb133', rapid: '#79d6ff', shield: '#7fe08f', life: '#ff775f' };
      const labels = { weapon: 'P', rapid: 'R', shield: 'S', life: '+' };
      ctx.fillStyle = colors[pickup.type];
      roundRect(ctx, pickup.x - 12, pickup.y - 12, 24, 24, 7);
      ctx.fill();
      ctx.fillStyle = '#07111f';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[pickup.type], pickup.x, pickup.y + 1);
      ctx.textBaseline = 'alphabetic';
    }

    function endGame() {
      gameOver = true;
      running = false;
      runtime.updateBest(score);
      runtime.showOverlay('游戏结束', `本局 ${score} 分。`);
      runtime.messageEl.textContent = `到达第 ${wave} 波。`;
    }

    const game = {
      reset,
      togglePause(force) {
        if (gameOver) return;
        paused = force == null ? !paused : force;
        runtime.pauseButton.textContent = paused ? '继续' : '暂停';
        paused ? runtime.showOverlay('暂停', '按继续回到战斗。') : runtime.hideOverlay();
      }
    };
    runtime.bindControls(game);
    const movePlayer = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      player.targetX = clamp(event.clientX - rect.left, 18, rect.width - 18);
      player.targetY = clamp(event.clientY - rect.top, rect.height * 0.48, rect.height - 34);
    };
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      movePlayer(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons) movePlayer(event);
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') player.targetX -= 28;
      if (event.key === 'ArrowRight') player.targetX += 28;
      if (event.key === 'ArrowUp') player.targetY -= 24;
      if (event.key === 'ArrowDown') player.targetY += 24;
      if (event.key === ' ') {
        event.preventDefault();
        game.togglePause();
      }
    });
    reset();
  }

  function bindHorizontal(canvas, keys, onMove, onEnd) {
    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      onMove(event.clientX - canvas.getBoundingClientRect().left);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons) onMove(event.clientX - canvas.getBoundingClientRect().left);
    });
    canvas.addEventListener('pointerup', () => onEnd());
    canvas.addEventListener('pointercancel', () => onEnd());
    document.querySelectorAll('[data-move]').forEach((button) => {
      const dir = button.dataset.move;
      button.addEventListener('pointerdown', () => {
        keys[dir] = true;
      });
      button.addEventListener('pointerup', () => {
        keys[dir] = false;
      });
      button.addEventListener('pointercancel', () => {
        keys[dir] = false;
      });
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  function bindPointerX(canvas, onMove) {
    const move = (event) => {
      event.preventDefault();
      onMove(event.clientX - canvas.getBoundingClientRect().left);
    };
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      move(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons) move(event);
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function shade(ctx, size, text) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#fff8e6';
    ctx.font = '900 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text, size.width / 2, size.height / 2);
  }

  window.RetroGames = {
    startDepthDrop,
    startHelicopter,
    startBrickBreaker,
    startSokoban,
    startSpaceShooter
  };
})();

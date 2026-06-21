(function () {
  'use strict';

  const shell = document.querySelector('.game-shell');
  const overlay = document.getElementById('overlay');
  const stage = document.querySelector('.game-stage');
  if (!shell || !overlay || !stage) return;

  const titleText = document.querySelector('.game-title h1')?.textContent?.trim() || document.title || '游戏';
  const messageEl = document.getElementById('message');
  shell.classList.add('fullscreen-shell');
  overlay.classList.add('drawer-overlay');

  function moveIfFound(selector, target) {
    const node = document.querySelector(selector);
    if (node && node.parentElement !== target) target.appendChild(node);
    return node;
  }

  function makeButton(label, className = 'tool-button') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  async function refreshInstalledApp(button) {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '更新中';
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch {
      // Reload anyway: users press this when an installed PWA appears stale.
    }
    window.setTimeout(() => window.location.reload(), 180);
  }

  function enhanceDrawer() {
    if (overlay.dataset.fullscreenReady === 'true') return;
    overlay.dataset.fullscreenReady = 'true';

    const head = document.createElement('div');
    head.className = 'drawer-head';
    const title = document.createElement('div');
    title.className = 'drawer-game-title';
    title.textContent = titleText;
    const home = document.createElement('a');
    home.className = 'tool-button drawer-home';
    home.href = '../../';
    home.textContent = '大厅';
    const headActions = document.createElement('div');
    headActions.className = 'drawer-head-actions';
    const update = makeButton('更新', 'tool-button drawer-update');
    update.addEventListener('click', () => refreshInstalledApp(update));
    headActions.append(update, home);
    head.append(title, headActions);
    overlay.prepend(head);

    const controls = document.createElement('div');
    controls.className = 'drawer-controls';
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
      [...headerActions.children].forEach((item) => {
        if (item.id === 'new-game' && overlay.querySelector('#overlay-new')) return;
        if (item.id !== 'pause') controls.appendChild(item);
      });
    }
    if (controls.children.length) {
      const label = document.createElement('div');
      label.className = 'drawer-section-label';
      label.textContent = '操作';
      overlay.append(label, controls);
    }

    if (shell.classList.contains('game-tetris')) {
      const nextCanvas = document.getElementById('next');
      const nextStat = nextCanvas?.closest('.stat');
      if (nextStat) {
        nextStat.classList.add('tetris-next-hud');
        stage.appendChild(nextStat);
      }
    }

    const stats = moveIfFound('.stat-row', overlay);
    if (stats) stats.classList.add('drawer-stats');

    const modes = moveIfFound('.mode-row', overlay);
    if (modes) modes.classList.add('drawer-modes');

    const footer = moveIfFound('.game-footer', overlay);
    if (footer) footer.classList.add('drawer-footer');

    const overlayActions = overlay.querySelector('.overlay-actions');
    if (overlayActions && !overlayActions.querySelector('.drawer-home-inline')) {
      const homeInline = document.createElement('a');
      homeInline.className = 'tool-button drawer-home-inline';
      homeInline.href = '../../';
      homeInline.textContent = '返回大厅';
      overlayActions.appendChild(homeInline);
    }
  }

  function showMenu() {
    enhanceDrawer();
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');
    const resume = document.getElementById('resume') || document.getElementById('overlay-resume');
    const overlayNew = document.getElementById('overlay-new');
    if (overlayTitle) overlayTitle.textContent = '菜单';
    if (overlayText) overlayText.textContent = messageEl?.textContent || '继续当前游戏。';
    if (resume) {
      resume.classList.remove('hidden');
      resume.textContent = '继续';
    }
    if (overlayNew) overlayNew.classList.remove('primary');
    overlay.classList.remove('hidden');
  }

  function createMenuButton() {
    let pauseButton = document.getElementById('pause');
    if (!pauseButton) {
      pauseButton = makeButton('菜单', 'tool-button shell-menu-button');
      pauseButton.id = 'pause';
      pauseButton.addEventListener('click', showMenu);
      shell.prepend(pauseButton);
    }
    pauseButton.classList.add('shell-menu-button');
    pauseButton.setAttribute('aria-label', `${titleText}菜单`);
    return pauseButton;
  }

  const pauseButton = createMenuButton();
  enhanceDrawer();

  function syncDrawerState() {
    shell.classList.toggle('drawer-open', !overlay.classList.contains('hidden'));
  }

  const observer = new MutationObserver(() => {
    if (!overlay.classList.contains('hidden')) enhanceDrawer();
    syncDrawerState();
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  syncDrawerState();

  if (!pauseButton.dataset.nativePause && !pauseButton.onclick) {
    pauseButton.dataset.nativePause = 'true';
  }
})();

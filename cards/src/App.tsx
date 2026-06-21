import { type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Card, sortCards } from './core/cards';
import { effectDurationMs, fourFourteenAIActionDelayMs, pauseAfterLatestEventMs } from './core/effects';
import { comboEffect, comboLabel } from './core/rules';
import { isAudioEnabled, playEffectSound, playSound, setAudioEnabled, vibrateForEffect } from './core/audio';
import { gameModules, gameOrder } from './games/catalog';
import type { DouDizhuState } from './games/doudizhu';
import { ActionKey, GameKey, TableRecord, TableView } from './games/types';
import { CardView } from './ui/CardView';
import { EffectOverlay } from './ui/EffectOverlay';
import { buildHandLayoutRows, handSpreadHeightForCount, type HandLayoutRow } from './ui/handLayout';
import { playedCardsFanMetrics, revealedHandLayout, slotContentWidth, slotWidthForSeat, type FanMetrics } from './ui/tableLayout';

const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new Event('pwa-update-ready'));
  },
  onOfflineReady() {
    window.dispatchEvent(new Event('pwa-offline-ready'));
  }
});

const STORAGE_GAME_KEY = 'pwa-games.cards.currentGame';
const FOUR_FOURTEEN_BEST_HINT_DELAY_MS = 180;
const HAND_LAYOUT_HORIZONTAL_PADDING = 24;

type ActionBannerKind = 'deal' | 'play' | 'pass' | 'cha' | 'gou';

interface ActionBannerState {
  id: number;
  text: string;
  subtitle: string;
  kind: ActionBannerKind;
}

interface SwipeSelectionState {
  pointerId: number;
  startX: number;
  startY: number;
  startIndex: number;
  isSwiping: boolean;
  flippedIds: Set<string>;
  lastIndex?: number;
}

export default function App() {
  const [gameKey, setGameKey] = useState<GameKey>(() => storedGameKey());
  const module = gameModules[gameKey];
  const [gameState, setGameState] = useState<unknown>(() => module.create());
  const view = module.view(gameState);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [audioOn, setAudioOn] = useState(isAudioEnabled());
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [manualUpdateBusy, setManualUpdateBusy] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionBanner, setActionBanner] = useState<ActionBannerState | undefined>();
  const [thinkingPlayerIndex, setThinkingPlayerIndex] = useState<number | undefined>();
  const [hinting, setHinting] = useState(false);
  const lastEffectId = useRef<number | undefined>(undefined);
  const lastBannerRecordId = useRef<number | undefined>(undefined);
  const lastSoundRecordId = useRef<number | undefined>(undefined);
  const previousPhase = useRef(view.phase);
  const dealReadyAnnounced = useRef(false);
  const hintGeneration = useRef(0);
  const gameStateRef = useRef(gameState);
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const handRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const swipeSelection = useRef<SwipeSelectionState | undefined>(undefined);
  const gamePickerRef = useRef<HTMLDivElement | null>(null);
  const viewportWidth = useViewportWidth();
  const handLayoutWidth = useHandLayoutWidth(handScrollRef, viewportWidth);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  useLandscapeLock();

  const isFourFourteen = gameKey === '414';
  const humanHand = view.players[0]?.hand ?? [];
  const sortedHumanHand = useMemo(() => sortCards(humanHand), [humanHand]);
  const handLayoutHeight = handSpreadHeightForCount(sortedHumanHand.length, gameKey);
  const handRows = useMemo(() => buildHandLayoutRows(sortedHumanHand, handLayoutWidth, handLayoutHeight), [sortedHumanHand, handLayoutWidth, handLayoutHeight]);
  const selectedCards = useMemo(() => humanHand.filter((card) => selectedIds.has(card.id)), [humanHand, selectedIds]);
  const legalActions = module.legalActions(gameState, selectedCards);
  const humanTurn = module.isHumanTurn(gameState);
  const rocket414Cards = useMemo(() => (isFourFourteen ? findRocket414Cards(humanHand) : undefined), [humanHand, isFourFourteen]);
  const rocket414Count = useMemo(() => (isFourFourteen ? countRocket414(humanHand) : 0), [humanHand, isFourFourteen]);
  const rocket414Ids = useMemo(() => new Set(rocket414Cards?.map((card) => card.id) ?? []), [rocket414Cards]);
  const landlordBottomCardIds = useMemo(() => doudizhuHumanBottomCardIds(gameKey, gameState), [gameKey, gameState]);
  const markedCardIds = isFourFourteen ? rocket414Ids : landlordBottomCardIds;
  const promptMessage = isFourFourteen ? view.promptText ?? view.message : view.message;
  const statusMessage = notice || (thinkingPlayerIndex == null ? promptMessage : `${view.players[thinkingPlayerIndex]?.name ?? 'AI'}思考中...`);
  const dealLabel = view.phase === 'idle' ? '发牌' : view.phase === 'dealing' ? '发牌中' : '重发';
  const dealIcon = view.phase === 'idle' ? '▶' : '↻';

  useEffect(() => {
    localStorage.setItem(STORAGE_GAME_KEY, gameKey);
  }, [gameKey]);

  useEffect(() => {
    if (!gameMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!gamePickerRef.current?.contains(event.target as Node)) {
        setGameMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGameMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [gameMenuOpen]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    const onOffline = () => setOfflineReady(true);
    window.addEventListener('pwa-update-ready', onUpdate);
    window.addEventListener('pwa-offline-ready', onOffline);
    return () => {
      window.removeEventListener('pwa-update-ready', onUpdate);
      window.removeEventListener('pwa-offline-ready', onOffline);
    };
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setShowInstallHint(isIOS && !standalone);
  }, []);

  useEffect(() => {
    setAudioEnabled(audioOn);
  }, [audioOn]);

  useEffect(() => {
    if (!view.effect || lastEffectId.current === view.effect.id) return;
    lastEffectId.current = view.effect.id;
    if (!isFourFourteen) {
      playEffectSound(view.effect.kind);
    }
    vibrateForEffect(view.effect.kind);
  }, [view.effect, isFourFourteen]);

  useEffect(() => {
    if (!isFourFourteen || !view.latestRecord || lastBannerRecordId.current === view.latestRecord.id) return;
    lastBannerRecordId.current = view.latestRecord.id;
    setActionBanner(bannerFromRecord(view.latestRecord, view));
    if (lastSoundRecordId.current !== view.latestRecord.id) {
      lastSoundRecordId.current = view.latestRecord.id;
      playFourFourteenRecordSound(view.latestRecord, view);
    }
  }, [isFourFourteen, view.latestRecord, view]);

  useEffect(() => {
    if (!actionBanner) return;
    const timer = window.setTimeout(() => {
      setActionBanner((current) => (current?.id === actionBanner.id ? undefined : current));
    }, bannerDurationMs(actionBanner));
    return () => window.clearTimeout(timer);
  }, [actionBanner]);

  useEffect(() => {
    if (view.phase !== 'dealing' || !module.dealStep) return;
    const delay = isFourFourteen && view.message === '发牌完成' ? 850 : isFourFourteen && deckCountFromView(view) === 1 ? 38 : 22;
    const timer = window.setTimeout(() => {
      setGameState((current: unknown) => module.dealStep!(current));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [gameState, module, view.phase, view.settingsSummary, isFourFourteen]);

  useEffect(() => {
    if (isFourFourteen && view.phase === 'dealing' && view.message === '发牌完成' && !dealReadyAnnounced.current) {
      dealReadyAnnounced.current = true;
      setNotice('发牌完成');
      setActionBanner({ id: bannerId(), text: '开始', subtitle: startSubtitle(view), kind: 'deal' });
      playSound('draw');
    }
    if (isFourFourteen && previousPhase.current === 'dealing' && view.phase === 'playing') {
      setNotice('');
      setActionBanner(undefined);
    }
    previousPhase.current = view.phase;
  }, [isFourFourteen, view]);

  useEffect(() => {
    if (view.phase === 'idle' || view.phase === 'dealing' || view.phase === 'finished' || module.isHumanTurn(gameState)) {
      setThinkingPlayerIndex(undefined);
      return;
    }
    const delay = isFourFourteen ? fourFourteenAIDelayMs(view) : view.effect ? effectDurationMs(view.effect.intensity) + 150 : view.phase === 'bidding' ? 520 : 720;
    setThinkingPlayerIndex(view.currentPlayerIndex);
    const timer = window.setTimeout(() => {
      setThinkingPlayerIndex(undefined);
      setGameState((current: unknown) => module.aiStep(current));
      setSelectedIds(new Set());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [gameState, module, view.phase, view.currentPlayerIndex, view.effect?.id, view.effect?.intensity, view.latestRecord?.id, isFourFourteen]);

  function changeGame(next: GameKey) {
    setGameMenuOpen(false);
    if (next === gameKey) return;
    cancelHint();
    setGameKey(next);
    setGameState(gameModules[next].create());
    setSelectedIds(new Set());
    setNotice('');
    setActionBanner(undefined);
    lastBannerRecordId.current = undefined;
    lastSoundRecordId.current = undefined;
  }

  function applyAction(action: ActionKey) {
    if (action === 'hint') {
      const generation = hintGeneration.current + 1;
      hintGeneration.current = generation;
      const cards = module.hint(gameState);
      if (cards.length === 0) {
        setHinting(false);
        setNotice('当前没有可提示的牌');
        playSound('error');
        return;
      }
      setSelectedIds(new Set(cards.map((card) => card.id)));
      const supportsBestHint = isFourFourteen && Boolean(module.bestHint);
      setNotice(supportsBestHint ? '已选中快速提示' : '已选中推荐牌');
      playSound('tap');
      if (supportsBestHint) {
        const snapshot = gameState;
        setHinting(true);
        window.setTimeout(() => {
          if (hintGeneration.current !== generation || gameStateRef.current !== snapshot) return;
          const bestCards = module.bestHint?.(snapshot) ?? cards;
          setHinting(false);
          if (bestCards.length === 0) return;
          setSelectedIds(new Set(bestCards.map((card) => card.id)));
          setNotice('已选中推荐牌');
        }, FOUR_FOURTEEN_BEST_HINT_DELAY_MS);
      }
      return;
    }
    cancelHint();
    if (action === 'clear') {
      setSelectedIds(new Set());
      setNotice('');
      playSound('tap');
      return;
    }
    if (action === 'deal') {
      setGameState((current: unknown) => module.deal(current));
      setSelectedIds(new Set());
      setNotice(isFourFourteen ? '正在发牌...' : '');
      dealReadyAnnounced.current = false;
      lastSoundRecordId.current = undefined;
      if (isFourFourteen) {
        setActionBanner({ id: bannerId(), text: '发牌', subtitle: dealSubtitle(view), kind: 'deal' });
      }
      playSound('deal');
      return;
    }
    const nextState = module.apply(gameState, action, selectedCards);
    const nextView = module.view(nextState);
    const invalidFourFourteenPlay = isFourFourteenInvalidPlay(action, selectedCards, view, nextView);
    setGameState(nextState);
    if (invalidFourFourteenPlay) {
      setNotice(nextView.message);
      playSound('error');
      return;
    }
    setSelectedIds(new Set());
    setNotice('');
    if (!isFourFourteen) {
      playSound(action === 'pass' || action === 'bid0' ? 'pass' : 'play');
    }
  }

  function setOption(option: string, value: string | number) {
    if (!module.setOption) return;
    cancelHint();
    setGameState((current: unknown) => module.setOption!(current, option, value));
    if (view.phase === 'idle') {
      setSelectedIds(new Set());
    }
  }

  function selectRocket414() {
    if (!rocket414Cards || !humanTurn) return;
    cancelHint();
    setSelectedIds(new Set(rocket414Cards.map((card) => card.id)));
    setNotice('已选中4A4火箭');
    playSound('tap');
  }

  function handleHandPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!humanTurn) return;
    const startIndex = handIndexAtPoint(event.clientX, event.clientY);
    if (startIndex == null) return;
    event.preventDefault();
    cancelHint();
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeSelection.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex,
      isSwiping: false,
      flippedIds: new Set()
    };
  }

  function handleHandPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipeSelection.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();

    const horizontalDistance = Math.abs(event.clientX - gesture.startX);
    const verticalDistance = Math.abs(event.clientY - gesture.startY);
    if (!gesture.isSwiping && (horizontalDistance > 10 || verticalDistance > 10)) {
      gesture.isSwiping = true;
      flipHandRange(gesture.startIndex);
    }

    if (!gesture.isSwiping) return;
    const index = handIndexAtPoint(event.clientX, event.clientY);
    if (index == null) return;
    if (gesture.lastIndex !== index || gesture.flippedIds.size === 0) {
      flipHandRange(index);
    }
  }

  function handleHandPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = swipeSelection.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!gesture.isSwiping) {
      const index = handIndexAtPoint(event.clientX, event.clientY) ?? gesture.startIndex;
      const card = sortedHumanHand[index];
      if (card) {
        flipHandCards([card]);
        playSound('tap');
      }
    }
    endHandPointer(event);
  }

  function handleHandPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    endHandPointer(event);
  }

  function endHandPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    swipeSelection.current = undefined;
  }

  function flipHandRange(endingIndex: number) {
    const gesture = swipeSelection.current;
    if (!gesture) return;
    const start = gesture.lastIndex ?? endingIndex;
    const lower = Math.min(start, endingIndex);
    const upper = Math.max(start, endingIndex);
    const cardsToFlip: Card[] = [];
    for (let index = lower; index <= upper; index += 1) {
      const card = sortedHumanHand[index];
      if (!card || gesture.flippedIds.has(card.id)) continue;
      gesture.flippedIds.add(card.id);
      cardsToFlip.push(card);
    }
    if (cardsToFlip.length > 0) {
      flipHandCards(cardsToFlip);
    }
    gesture.lastIndex = endingIndex;
  }

  function flipHandCards(cards: Card[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      cards.forEach((card) => {
        if (next.has(card.id)) next.delete(card.id);
        else next.add(card.id);
      });
      return next;
    });
  }

  function cancelHint() {
    hintGeneration.current += 1;
    setHinting(false);
  }

  async function refreshApp() {
    if (manualUpdateBusy) return;
    setManualUpdateBusy(true);
    setNotice('正在检查更新...');
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
        await updateSW(true);
      }
    } catch {
      // A manual reload is still useful when the update check cannot complete.
    }
    window.setTimeout(() => window.location.reload(), 180);
  }

  function handIndexAtPoint(clientX: number, clientY: number): number | undefined {
    if (sortedHumanHand.length === 0) return undefined;
    const rows = handRows
      .map((row, rowIndex) => ({ row, node: handRowRefs.current[rowIndex] }))
      .filter((entry): entry is { row: HandLayoutRow; node: HTMLDivElement } => Boolean(entry.node) && entry.row.cards.length > 0);
    if (rows.length === 0) return undefined;

    const verticallyEligible = rows.filter(({ node }) => {
      const rect = node.getBoundingClientRect();
      return clientY >= rect.top - 16 && clientY <= rect.bottom + 16;
    });
    const candidates = verticallyEligible.length > 0 ? verticallyEligible : rows;
    const chosen = candidates.reduce((best, current) => {
      const bestRect = best.node.getBoundingClientRect();
      const currentRect = current.node.getBoundingClientRect();
      const bestDistance = Math.abs(clientY - (bestRect.top + bestRect.height / 2));
      const currentDistance = Math.abs(clientY - (currentRect.top + currentRect.height / 2));
      return currentDistance < bestDistance ? current : best;
    });

    const rect = chosen.node.getBoundingClientRect();
    const step = Math.max(1, chosen.row.cardWidth + chosen.row.spacing);
    const totalWidth = chosen.row.cardWidth + Math.max(0, chosen.row.cards.length - 1) * step;
    const leftInset = Math.max(0, (rect.width - totalWidth) / 2);
    const centerRelativeX = clientX - rect.left - leftInset - chosen.row.cardWidth / 2;
    const rowCardIndex = Math.min(chosen.row.cards.length - 1, Math.max(0, Math.round(centerRelativeX / step)));
    return chosen.row.startIndex + rowCardIndex;
  }

  return (
    <main className="app-shell">
      <header className={`topbar ${isFourFourteen ? 'topbar-414' : ''}`}>
        <div className={`brand ${isFourFourteen ? 'brand-414' : ''}`}>
          <span className="brand-mark">
            <strong>{isFourFourteen ? '414' : '扑克合集'}</strong>
            {isFourFourteen && <em>Poker</em>}
          </span>
          <span className="brand-status">{statusMessage}</span>
        </div>
        <nav className="game-tabs" aria-label="选择玩法">
          {gameOrder.map((key) => (
            <button key={key} type="button" className={key === gameKey ? 'active' : ''} onClick={() => changeGame(key)}>
              {gameModules[key].title}
            </button>
          ))}
        </nav>
        <div className={`game-picker ${gameMenuOpen ? 'open' : ''}`} ref={gamePickerRef}>
          <button
            type="button"
            className="game-picker-button"
            aria-label="选择玩法"
            aria-haspopup="menu"
            aria-expanded={gameMenuOpen}
            onClick={() => setGameMenuOpen((open) => !open)}
          >
            <span>玩法</span>
            <strong>{module.title}</strong>
            <i aria-hidden="true" />
          </button>
          {gameMenuOpen && (
            <div className="game-menu" role="menu" aria-label="选择玩法">
              {gameOrder.map((key) => (
                <button key={key} type="button" className={key === gameKey ? 'active' : ''} role="menuitemradio" aria-checked={key === gameKey} onClick={() => changeGame(key)}>
                  <span>{gameModules[key].title}</span>
                  {key === gameKey && <b>当前</b>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="top-actions">
          {gameKey === '414' && <FourFourteenSettings view={view} setOption={setOption} />}
          <button
            type="button"
            className={`icon-action ${audioOn ? 'active' : ''}`}
            onClick={() => setAudioOn((value) => !value)}
            aria-label={audioOn ? '关闭音效' : '开启音效'}
            title={audioOn ? '关闭音效' : '开启音效'}
          >
            <span className={`speaker-symbol ${audioOn ? 'is-on' : 'is-off'}`} aria-hidden="true" />
          </button>
          <button type="button" className="deal-action" disabled={view.phase === 'dealing'} onClick={() => applyAction('deal')}>
            <span aria-hidden="true">{dealIcon}</span>
            <span>{dealLabel}</span>
          </button>
        </div>
      </header>

      <section className={`table table-${view.players.length} ${isFourFourteen ? 'table-414-game' : ''} ${view.phase === 'finished' ? 'table-finished' : ''}`}>
        <div className="table-felt" />
        {view.players.map((player) => (
          isFourFourteen && player.id === 0 ? null : <PlayerCluster key={player.id} view={view} playerIndex={player.id} />
        ))}
        {view.tableRecords.map((record, index) => (
          <PlaySlot
            key={index}
            view={view}
            playerIndex={index}
            record={record}
            hideEmptyPlaceholder={isFourFourteen}
            revealOnFinish
            viewportWidth={viewportWidth}
          />
        ))}
        {isFourFourteen && (view.phase === 'idle' || view.phase === 'dealing') ? (
          <PreGamePanel view={view} gameKey={gameKey} onChangeGame={changeGame} applyAction={() => applyAction('deal')} />
        ) : isFourFourteen && actionBanner ? null : (
          <CenterMessage view={view} notice={notice} />
        )}
        <EffectOverlay effect={view.effect} seatCount={view.players.length} />
        {isFourFourteen && actionBanner && <ActionBanner banner={actionBanner} />}
      </section>

      <footer className={`hand-zone ${isFourFourteen ? 'hand-zone-414' : ''}`}>
        {isFourFourteen ? (
          <FourFourteenHandMeta
            view={view}
            selectedCount={selectedIds.size}
            rocketCount={rocket414Count}
            canSelectRocket={Boolean(rocket414Cards && humanTurn)}
            onSelectRocket={selectRocket414}
            onClearSelection={() => applyAction('clear')}
          />
        ) : (
          <div className="hand-meta">
            <span>你的手牌 {humanHand.length}张</span>
            <span>{view.settingsSummary}</span>
          </div>
        )}
        <div className="hand-scroll" ref={handScrollRef}>
          <div
            className={`hand-grid ${handRows.length > 1 ? 'two-rows' : 'one-row'}`}
            style={{ '--hand-grid-height': `${handLayoutHeight}px` } as CSSProperties}
            onPointerDown={handleHandPointerDown}
            onPointerMove={handleHandPointerMove}
            onPointerUp={handleHandPointerUp}
            onPointerCancel={handleHandPointerCancel}
          >
            {handRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="hand-row"
                style={handRowStyle(row)}
                ref={(node) => {
                  handRowRefs.current[rowIndex] = node;
                }}
              >
                {row.cards.map((card) => (
                  <CardView
                    key={card.id}
                    card={card}
                    selected={selectedIds.has(card.id)}
                    marked={markedCardIds.has(card.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <ActionBar actions={legalActions} applyAction={applyAction} phase={view.phase} gameKey={gameKey} hinting={hinting} />
      </footer>

      <div className="orientation-guard" role="status" aria-live="polite">
        <strong>请横屏游玩</strong>
        <span>旋转设备后继续，安装到主屏幕后会优先横屏启动。</span>
        <div className="orientation-actions">
          <a className="orientation-home-link" href="/">
            返回大厅
          </a>
          <button type="button" className="orientation-update-button" disabled={manualUpdateBusy} onClick={refreshApp}>
            {manualUpdateBusy ? '更新中' : '检查更新'}
          </button>
        </div>
        <div className="orientation-game-list" aria-label="选择玩法">
          {gameOrder.map((key) => (
            <button
              key={key}
              type="button"
              className={`orientation-game-button ${key === gameKey ? 'active' : ''}`}
              aria-pressed={key === gameKey}
              onClick={() => changeGame(key)}
            >
              {gameModules[key].title}
            </button>
          ))}
        </div>
      </div>

      <div className="toast-stack">
        {showInstallHint && <div className="toast">iPhone 安装：Safari 分享按钮 → 添加到主屏幕。首次加载后可离线运行。</div>}
        {offlineReady && <div className="toast">离线缓存已准备好。</div>}
        {updateReady && (
          <button type="button" className="toast update" onClick={refreshApp}>
            有新版本，点此刷新
          </button>
        )}
      </div>
    </main>
  );
}

function FourFourteenSettings({ view, setOption }: { view: TableView; setOption: (option: string, value: string | number) => void }) {
  const summary = view.settingsSummary ?? '';
  const playerCount = summary.includes('4人') ? 4 : 3;
  const deckCount = Number(summary.match(/(\d)副/)?.[1] ?? 1);
  const competitive = summary.includes('竞技');
  const dealing = view.phase === 'dealing';
  return (
    <div className="inline-settings">
      <button type="button" className={playerCount === 3 ? 'active' : ''} disabled={dealing} onClick={() => setOption('playerCount', 3)}>
        3人
      </button>
      <button type="button" className={playerCount === 4 ? 'active' : ''} disabled={dealing} onClick={() => setOption('playerCount', 4)}>
        4人
      </button>
      <button type="button" disabled={dealing || deckCount <= 1} onClick={() => setOption('deckCount', Math.max(1, deckCount - 1))}>
        -
      </button>
      <span>{deckCount}副</span>
      <button type="button" disabled={dealing || deckCount >= 3} onClick={() => setOption('deckCount', Math.min(3, deckCount + 1))}>
        +
      </button>
      <button type="button" className={!competitive ? 'active' : ''} disabled={dealing} onClick={() => setOption('aiStyle', 'relaxed')}>
        休闲
      </button>
      <button type="button" className={competitive ? 'active' : ''} disabled={dealing} onClick={() => setOption('aiStyle', 'competitive')}>
        竞技
      </button>
    </div>
  );
}

function CenterMessage({ view, notice }: { view: TableView; notice: string }) {
  if (view.phase === 'finished' && view.scoreLines?.length) {
    return <ScorePanel view={view} />;
  }

  if (view.title === '414') {
    return (
      <div className={`center-message ${notice ? 'has-notice' : ''}`}>
        <strong>{notice || view.promptText || view.message}</strong>
        {notice && <span>{view.promptText || view.message}</span>}
      </div>
    );
  }

  return (
    <div className={`center-message ${notice ? 'has-notice' : ''}`}>
      <strong>{notice || view.visibleRecord?.label || view.title}</strong>
      <span>{notice ? view.message : view.subtitle}</span>
      {view.scores && view.scores.length > 0 && (
        <div className="scores">
          {view.scores.map((score) => (
            <span key={score}>{score}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScorePanel({ view }: { view: TableView }) {
  return (
    <div className="score-panel">
      <strong>结算</strong>
      <div className="score-lines">
        {view.scoreLines?.map((score) => (
          <div key={score.playerIndex} className={score.penalty === 0 ? 'winner' : ''}>
            <span>{score.playerName}</span>
            <b>{score.penalty === 0 ? '赢家' : `${score.remainingCards}张 x${score.multiplier} = ${score.penalty}`}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreGamePanel({
  view,
  gameKey,
  onChangeGame,
  applyAction
}: {
  view: TableView;
  gameKey: GameKey;
  onChangeGame: (key: GameKey) => void;
  applyAction: () => void;
}) {
  const dealing = view.phase === 'dealing';
  return (
    <div className="pregame-panel">
      <div className="pregame-panel-inner">
        <strong>{dealing ? '正在发牌' : '准备开始'}</strong>
        <div className="pregame-game-list" aria-label="选择玩法">
          {gameOrder.map((key) => (
            <button
              key={key}
              type="button"
              className={`pregame-game-button ${key === gameKey ? 'active' : ''}`}
              disabled={dealing}
              aria-pressed={key === gameKey}
              onClick={() => onChangeGame(key)}
            >
              {gameModules[key].title}
            </button>
          ))}
        </div>
        <div className="pregame-players">
          {view.players.map((player) => (
            <div key={player.id} className="pregame-player">
              <span>{player.name}</span>
              <b>{player.hand.length}</b>
            </div>
          ))}
        </div>
        {dealing ? (
          <div className="deal-progress" aria-label="发牌中">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <button type="button" className="center-deal-button" onClick={applyAction}>
            <span>▶</span>
            发牌
          </button>
        )}
        <small>{dealing ? view.message : `默认${deckCountFromView(view)}副牌，可直接发牌`}</small>
      </div>
    </div>
  );
}

function FourFourteenHandMeta({
  view,
  selectedCount,
  rocketCount,
  canSelectRocket,
  onSelectRocket,
  onClearSelection
}: {
  view: TableView;
  selectedCount: number;
  rocketCount: number;
  canSelectRocket: boolean;
  onSelectRocket: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="hand-meta ios-hand-meta">
      <div className="hand-status-left">
        <span>{view.players[0]?.hand.length ?? 0}张</span>
        <span className={view.currentPlayerIndex === 0 && view.phase === 'playing' ? 'turn-active' : ''}>{view.players[0]?.status ?? '等待'}</span>
        {rocketCount > 0 && (
          <button type="button" className="rocket-badge" disabled={!canSelectRocket} onClick={onSelectRocket}>
            <span>⚡</span>
            {rocketCount > 1 ? `4A4x${rocketCount}` : '4A4'}
          </button>
        )}
        {selectedCount > 0 && (
          <button type="button" className="clear-selection-button" onClick={onClearSelection}>
            取消
          </button>
        )}
      </div>
      <span>{view.settingsSummary}</span>
    </div>
  );
}

function ActionBanner({ banner }: { banner: ActionBannerState }) {
  return (
    <div key={banner.id} className={`action-banner ${banner.kind}`}>
      <strong>{banner.text}</strong>
      <span>{banner.subtitle}</span>
    </div>
  );
}

function ActionBar({
  actions,
  applyAction,
  phase,
  gameKey,
  hinting
}: {
  actions: ActionKey[];
  applyAction: (action: ActionKey) => void;
  phase: string;
  gameKey: GameKey;
  hinting: boolean;
}) {
  const labels: Record<ActionKey, string> = {
    deal: phase === 'idle' ? '发牌' : '重发',
    play: '出牌',
    pass: '过',
    hint: hinting ? '提示中' : '提示',
    clear: '全取消',
    cha: '叉',
    gou: '勾',
    bid0: '不叫',
    bid1: '1分',
    bid2: '2分',
    bid3: '3分'
  };
  const fourFourteenIcons: Partial<Record<ActionKey, string>> = {
    hint: '!',
    pass: '↷',
    cha: '×',
    gou: '✓',
    play: '➤'
  };
  const order: ActionKey[] = gameKey === '414'
    ? ['hint', 'pass', 'cha', 'gou', 'play']
    : ['hint', 'clear', 'pass', 'cha', 'gou', 'play', 'bid0', 'bid1', 'bid2', 'bid3'];
  const isFourFourteen = gameKey === '414';
  const visibleOrder = isFourFourteen ? order : order.filter((action) => actions.includes(action));
  if (!isFourFourteen && visibleOrder.length === 0) return null;
  return (
    <div className={`action-bar ${isFourFourteen ? 'ios-action-bar' : ''}`}>
      {visibleOrder.map((action) => (
        <button
          key={action}
          type="button"
          disabled={!actions.includes(action) || (action === 'hint' && hinting)}
          className={[
            'action-button',
            `action-${action}`,
            actions.includes(action) && !(action === 'hint' && hinting) ? 'enabled' : '',
            action === 'play' || action === 'cha' || action === 'gou' ? 'primary' : ''
          ].join(' ')}
          onClick={() => applyAction(action)}
        >
          {isFourFourteen && fourFourteenIcons[action] ? <span className="action-icon" aria-hidden="true">{fourFourteenIcons[action]}</span> : null}
          <span>{labels[action]}</span>
        </button>
      ))}
    </div>
  );
}

function isFourFourteenInvalidPlay(action: ActionKey, selectedCards: Card[], previousView: TableView, nextView: TableView): boolean {
  if (previousView.title !== '414' || action !== 'play' || selectedCards.length === 0) return false;
  return (
    previousView.phase === 'playing' &&
    nextView.phase === 'playing' &&
    previousView.currentPlayerIndex === nextView.currentPlayerIndex &&
    (nextView.message === '牌型不合法' || nextView.message === '管不上当前牌')
  );
}

function PlayerCluster({ view, playerIndex }: { view: TableView; playerIndex: number }) {
  const player = view.players[playerIndex];
  const active = view.phase === 'playing' && view.currentPlayerIndex === playerIndex;
  const status = player.status ?? (active ? '行动中' : '等待');
  return (
    <div className={`player-cluster ${seatClass(playerIndex, view.players.length)} ${active ? 'current' : ''}`}>
      <strong>{player.name}</strong>
      <span>
        {player.hand.length}张 {player.role ?? player.team ?? ''}
      </span>
      <small>{status}</small>
    </div>
  );
}

function PlaySlot({
  view,
  playerIndex,
  record,
  hideEmptyPlaceholder = false,
  revealOnFinish = false,
  viewportWidth
}: {
  view: TableView;
  playerIndex: number;
  record?: TableRecord;
  hideEmptyPlaceholder?: boolean;
  revealOnFinish?: boolean;
  viewportWidth: number;
}) {
  const player = view.players[playerIndex];
  const revealCards = revealOnFinish && view.phase === 'finished' && playerIndex !== 0 && player ? sortCards(player.hand) : undefined;
  const slotWidth = slotWidthForSeat(playerIndex, view.players.length, viewportWidth);
  const slotStyle = { width: `${slotWidth}px` };
  const slotPresentation = record && view.title === '414' ? fourFourteenSlotPresentation(record, player?.name ?? '') : undefined;
  const slotRecordClass = slotPresentation?.slotClass ?? '';
  const cardFanWidth = slotContentWidth(slotWidth, Boolean(slotRecordClass));

  if (revealCards) {
    return (
      <div className={`play-slot revealed-slot ${seatClass(playerIndex, view.players.length)}`} style={slotStyle}>
        <span className="slot-label revealed-label">{player.name} · {revealCards.length > 0 ? `${revealCards.length}张` : '已出完'}</span>
        <RevealedHandFan cards={revealCards} width={slotWidth} />
      </div>
    );
  }

  return (
    <div className={`play-slot ${seatClass(playerIndex, view.players.length)} ${slotRecordClass}`} style={slotStyle}>
      {record ? (
        <>
          <span className={slotPresentation?.className ?? (record.passed ? 'pass-label' : 'slot-label')}>
            {slotPresentation?.text ?? record.label}
          </span>
          {record.cards.length > 0 ? <PlayedCardsFan cards={record.cards} width={cardFanWidth} /> : <span className="pass-label pass-card-label">过</span>}
        </>
      ) : hideEmptyPlaceholder ? null : (
        <span className="slot-placeholder">{view.players[playerIndex]?.name}</span>
      )}
    </div>
  );
}

function fourFourteenSlotPresentation(record: TableRecord, playerName: string): { text: string; className: string; slotClass: string } {
  if (record.system) {
    return {
      text: record.label,
      className: `slot-label slot-${record.system}`,
      slotClass: record.system === 'deadCha' ? 'slot-record-cha' : 'slot-record-normal'
    };
  }
  if (record.passed) return { text: `${playerName} · 过`, className: 'slot-label slot-pass', slotClass: 'slot-record-pass' };
  if (record.combo?.kind === 'cha') return { text: `${playerName} · 叉`, className: 'slot-label slot-cha', slotClass: 'slot-record-cha' };
  if (record.combo?.kind === 'gou') return { text: `${playerName} · 勾`, className: 'slot-label slot-gou', slotClass: 'slot-record-gou' };
  return { text: `${playerName} · ${record.combo ? comboLabel(record.combo) : '出牌'}`, className: 'slot-label', slotClass: 'slot-record-normal' };
}

function PlayedCardsFan({ cards, width }: { cards: Card[]; width: number }) {
  const metrics = playedCardsFanMetrics(width, cards.length);
  return (
    <div className="slot-cards" style={{ minHeight: `${metrics.cardHeight}px` }}>
      {cards.map((card, index) => (
        <CardView key={card.id} card={card} mini style={miniCardStyle(metrics, index)} />
      ))}
    </div>
  );
}

function RevealedHandFan({ cards, width }: { cards: Card[]; width: number }) {
  if (cards.length === 0) {
    return <b className="revealed-win">WIN</b>;
  }

  const layout = revealedHandLayout(width, 92, cards.length);
  return (
    <div className="revealed-card-stack">
      {layout.rows.map((row, rowIndex) => {
        const metrics = { cardWidth: layout.cardWidth, cardHeight: layout.cardHeight, spacing: row.spacing };
        return (
          <div
            key={rowIndex}
            className="revealed-card-row"
            style={{
              top: `${row.y}px`,
              height: `${layout.cardHeight}px`
            }}
          >
            {cards.slice(row.startIndex, row.startIndex + row.count).map((card, index) => (
              <CardView key={card.id} card={card} mini style={miniCardStyle(metrics, index)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return width;
}

function useHandLayoutWidth(ref: RefObject<HTMLDivElement | null>, viewportWidth: number): number {
  const [width, setWidth] = useState(() => handAvailableWidth(viewportWidth));

  useEffect(() => {
    const update = () => {
      const measuredWidth = ref.current ? ref.current.clientWidth - HAND_LAYOUT_HORIZONTAL_PADDING : handAvailableWidth(window.innerWidth);
      const nextWidth = Math.max(1, Math.floor(measuredWidth));
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    update();
    const observer = typeof ResizeObserver === 'undefined' || !ref.current ? undefined : new ResizeObserver(update);
    if (ref.current) observer?.observe(ref.current);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [ref, viewportWidth]);

  return width;
}

function useLandscapeLock() {
  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
    const lockLandscape = () => {
      if (!orientation?.lock) return;
      void orientation.lock('landscape').catch(() => undefined);
    };

    lockLandscape();
    window.addEventListener('pointerdown', lockLandscape, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', lockLandscape);
  }, []);
}

function handAvailableWidth(viewportWidth: number): number {
  return Math.max(1, viewportWidth - 52);
}

function miniCardStyle(metrics: FanMetrics, index: number): CSSProperties {
  const rankSize = Math.max(9, Math.min(12, metrics.cardWidth * 0.31));
  const suitSize = Math.max(9, Math.min(12, metrics.cardWidth * 0.34));
  return {
    width: `${metrics.cardWidth}px`,
    height: `${metrics.cardHeight}px`,
    marginLeft: index === 0 ? 0 : `${metrics.spacing}px`,
    '--mini-rank-size': `${rankSize}px`,
    '--mini-suit-size': `${suitSize}px`
  } as CSSProperties;
}

function handRowStyle(row: HandLayoutRow): CSSProperties {
  return {
    top: `${row.y}px`,
    height: `${row.cardHeight}px`,
    '--card-width': `${row.cardWidth}px`,
    '--card-height': `${row.cardHeight}px`,
    '--card-spacing': `${row.spacing}px`
  } as CSSProperties;
}

function seatClass(index: number, seatCount: number): string {
  if (index === 0) return 'seat-bottom';
  if (seatCount === 3) return index === 1 ? 'seat-left' : 'seat-right';
  if (index === 1) return 'seat-left';
  if (index === 2) return 'seat-top';
  return 'seat-right';
}

function bannerId(): number {
  return Date.now() + Math.random();
}

function bannerDurationMs(banner: ActionBannerState): number {
  if (banner.kind === 'cha' || banner.kind === 'gou') return 1650;
  return 950;
}

function bannerFromRecord(record: TableRecord, view: TableView): ActionBannerState | undefined {
  const playerName = view.players[record.playerIndex]?.name ?? '';
  if (record.system === 'deadCha') {
    return { id: bannerId(), text: '死叉', subtitle: record.label, kind: 'cha' };
  }
  if (record.system === 'relead') {
    return { id: bannerId(), text: '重起', subtitle: record.label, kind: 'play' };
  }
  if (record.system === 'leadStart') {
    return undefined;
  }
  if (record.system === 'gameOver') {
    return undefined;
  }
  if (record.passed) {
    return { id: bannerId(), text: '过', subtitle: playerName, kind: 'pass' };
  }
  if (record.combo?.kind === 'cha') {
    return { id: bannerId(), text: '叉!', subtitle: playerName, kind: 'cha' };
  }
  if (record.combo?.kind === 'gou') {
    return { id: bannerId(), text: '勾!', subtitle: playerName, kind: 'gou' };
  }
  const effect = comboEffect('414', record.combo);
  if (effect?.intensity === 's' || effect?.intensity === 'a') return undefined;
  return {
    id: bannerId(),
    text: record.combo ? comboLabel(record.combo) : '出牌',
    subtitle: playerName,
    kind: 'play'
  };
}

function playFourFourteenRecordSound(record: TableRecord, view: TableView): void {
  if (record.system === 'leadStart') {
    return;
  }
  if (record.system === 'gameOver') {
    playSound('tap');
    return;
  }
  if (record.system) {
    playSound('reaction');
    return;
  }
  if (record.passed) {
    playSound('pass');
    return;
  }
  const effect = view.effect?.playerIndex === record.playerIndex ? view.effect : undefined;
  playEffectSound(effect?.kind ?? comboEffect('414', record.combo)?.kind);
}

function fourFourteenAIDelayMs(view: TableView): number {
  const latest = view.latestRecord;
  return fourFourteenAIActionDelayMs({
    hasLatestEvent: Boolean(latest),
    latestEventIsLeadStart: latest?.system === 'leadStart',
    latestEventIsReaction: latest?.combo?.kind === 'cha' || latest?.combo?.kind === 'gou',
    latestEventPlayerIndex: latest?.playerIndex,
    intensity: view.effect?.intensity
  });
}

function dealSubtitle(view: TableView): string {
  return `${deckCountFromView(view)}副牌`;
}

function startSubtitle(view: TableView): string {
  const playerName = view.players[view.currentPlayerIndex]?.name ?? '';
  return playerName ? `${playerName}先出` : '开始';
}

function deckCountFromView(view: TableView): number {
  return Number(view.settingsSummary?.match(/(\d)副/)?.[1] ?? 1);
}

function findRocket414Cards(cards: Card[]): Card[] | undefined {
  const sorted = sortCards(cards);
  const fours = sorted.filter((card) => card.rank === '4');
  const aces = sorted.filter((card) => card.rank === 'A');
  if (fours.length < 2 || aces.length < 1) return undefined;
  return sortCards([...fours.slice(0, 2), aces[0]]);
}

function countRocket414(cards: Card[]): number {
  const fours = cards.filter((card) => card.rank === '4').length;
  const aces = cards.filter((card) => card.rank === 'A').length;
  return Math.min(Math.floor(fours / 2), aces);
}

function doudizhuHumanBottomCardIds(gameKey: GameKey, state: unknown): Set<string> {
  if (gameKey !== 'doudizhu') return new Set();
  const doudizhu = state as Partial<DouDizhuState>;
  if (doudizhu.landlordIndex !== 0 || !Array.isArray(doudizhu.bottomCards)) return new Set();
  return new Set(doudizhu.bottomCards.map((card) => card.id));
}

function storedGameKey(): GameKey {
  const value = localStorage.getItem(STORAGE_GAME_KEY) as GameKey | null;
  return value && gameOrder.includes(value) ? value : '414';
}

import { Card, containsAllCards, makeDeck, removeCards, shuffle, sortCards } from '../core/cards';
import { Combo, canBeatRunFast, classifyRunFast, comboEffect, comboLabel } from '../core/rules';
import { chooseAICombo, chooseHintCombo } from './ai';
import { ActionKey, GameModule, GamePhase, PlayerState, TableRecord, TableView, nextActive, tableRecordId } from './types';
import { TableEffect } from '../core/effects';

export interface RunFastState {
  key: 'runfast';
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerIndex: number;
  firstPlayDone: boolean;
  lastPlay?: TableRecord;
  visibleRecord?: TableRecord;
  tableRecords: Array<TableRecord | undefined>;
  passCount: number;
  message: string;
  scores: string[];
  effect?: TableEffect;
  effectSeq: number;
}

export const runFastModule: GameModule<RunFastState> = {
  key: 'runfast',
  title: '跑得快',
  create,
  view,
  deal,
  legalActions,
  apply,
  hint,
  aiStep,
  isHumanTurn: (state) => state.phase !== 'finished' && state.currentPlayerIndex === 0
};

function create(): RunFastState {
  const players = ['你', 'AI 左', 'AI 右'].map<PlayerState>((name, index) => ({
    id: index,
    name,
    isHuman: index === 0,
    hand: [],
    status: '等待发牌'
  }));
  return {
    key: 'runfast',
    phase: 'idle',
    players,
    currentPlayerIndex: 0,
    firstPlayDone: false,
    tableRecords: Array(3).fill(undefined),
    passCount: 0,
    message: '点发牌开始',
    scores: [],
    effectSeq: 0
  };
}

function view(state: RunFastState): TableView {
  return {
    title: '跑得快',
    subtitle: '3人 · 黑桃3先出 · 每人16张',
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    tableRecords: state.tableRecords,
    visibleRecord: state.visibleRecord,
    message: state.message,
    scores: state.scores,
    effect: state.effect,
    settingsSummary: '黑桃3首出'
  };
}

function deal(state: RunFastState): RunFastState {
  const deck = shuffle(makeDeck(1, false).filter((card) => card.rank !== '2'));
  const hands = [deck.slice(0, 16), deck.slice(16, 32), deck.slice(32, 48)].map((hand) => sortCards(hand));
  const first = hands.findIndex((hand) => hand.some((card) => card.rank === '3' && card.suit === 'S'));
  return {
    ...create(),
    players: state.players.map((player, index) => ({ ...player, hand: hands[index], status: index === first ? '黑桃3先出' : '等待' })),
    phase: 'playing',
    currentPlayerIndex: first,
    message: `黑桃3在${state.players[first].name}手中`
  };
}

function legalActions(state: RunFastState, selected: Card[]): ActionKey[] {
  if (state.phase === 'idle' || state.phase === 'finished') return ['deal'];
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const actions: ActionKey[] = ['hint', 'clear'];
  const combo = classifyRunFast(selected);
  const spadeThree = state.players[0].hand.find((card) => card.rank === '3' && card.suit === 'S');
  const firstOk = state.firstPlayDone || !spadeThree || selected.some((card) => card.id === spadeThree.id);
  const previousCombo = state.lastPlay?.combo;
  if (combo && firstOk && (!previousCombo || canBeatRunFast(combo, previousCombo))) {
    actions.push('play');
  }
  if (state.lastPlay) actions.push('pass');
  return actions;
}

function apply(state: RunFastState, action: ActionKey, selected: Card[]): RunFastState {
  if (action === 'deal') return deal(state);
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return state;
  if (action === 'pass') return applyPass(state);
  if (action === 'play') return applyPlay(state, selected);
  return state;
}

function hint(state: RunFastState): Card[] {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const spadeThree = state.firstPlayDone ? undefined : state.players[0].hand.find((card) => card.rank === '3' && card.suit === 'S');
  const combo = chooseHintCombo({
    ruleset: 'runfast',
    playerIndex: 0,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    firstPlayMustContain: spadeThree
  });
  return combo?.cards ?? [];
}

function aiStep(state: RunFastState): RunFastState {
  if (state.phase !== 'playing' || state.currentPlayerIndex === 0) return state;
  const firstCard = state.firstPlayDone ? undefined : state.players[state.currentPlayerIndex].hand.find((card) => card.rank === '3' && card.suit === 'S');
  const combo = chooseAICombo({
    ruleset: 'runfast',
    playerIndex: state.currentPlayerIndex,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    firstPlayMustContain: firstCard
  });
  return combo ? applyPlay(state, combo.cards) : applyPass(state);
}

function applyPlay(state: RunFastState, selected: Card[]): RunFastState {
  const player = state.players[state.currentPlayerIndex];
  if (!containsAllCards(player.hand, selected)) return state;
  const combo = classifyRunFast(selected);
  if (!combo) return { ...state, message: '牌型不合法' };
  const spadeThree = player.hand.find((card) => card.rank === '3' && card.suit === 'S');
  if (!state.firstPlayDone && spadeThree && !selected.some((card) => card.id === spadeThree.id)) {
    return { ...state, message: '第一手必须带黑桃3' };
  }
  if (state.lastPlay?.combo && !canBeatRunFast(combo, state.lastPlay.combo)) {
    return { ...state, message: '管不上当前牌' };
  }
  const players = updateHand(state.players, state.currentPlayerIndex, removeCards(player.hand, selected));
  const record = makeRecord(state, selected, combo, `${player.name}出${comboLabel(combo)}`);
  const next = afterRecord({ ...state, players }, record);
  if (players[state.currentPlayerIndex].hand.length === 0) return finish(next, state.currentPlayerIndex);
  return {
    ...next,
    firstPlayDone: true,
    currentPlayerIndex: nextActive(players, state.currentPlayerIndex),
    lastPlay: record,
    passCount: 0,
    message: record.label
  };
}

function applyPass(state: RunFastState): RunFastState {
  if (!state.lastPlay) return state;
  const record = makeRecord(state, [], undefined, `${state.players[state.currentPlayerIndex].name}过`, true);
  const passCount = state.passCount + 1;
  const tableRecords = [...state.tableRecords];
  tableRecords[state.currentPlayerIndex] = record;
  if (passCount >= 2) {
    const owner = state.lastPlay.playerIndex;
    return {
      ...state,
      tableRecords,
      currentPlayerIndex: owner,
      lastPlay: undefined,
      passCount: 0,
      message: `${state.players[owner].name}重新起手`
    };
  }
  return {
    ...state,
    tableRecords,
    currentPlayerIndex: nextActive(state.players, state.currentPlayerIndex),
    passCount,
    message: record.label
  };
}

function afterRecord(state: RunFastState, record: TableRecord): RunFastState {
  const tableRecords = [...state.tableRecords];
  tableRecords[record.playerIndex] = record;
  const mapping = comboEffect('runfast', record.combo);
  return {
    ...state,
    tableRecords,
    visibleRecord: record,
    effect: mapping ? { id: state.effectSeq + 1, playerIndex: record.playerIndex, ...mapping } : undefined,
    effectSeq: state.effectSeq + 1
  };
}

function finish(state: RunFastState, winnerIndex: number): RunFastState {
  return {
    ...state,
    phase: 'finished',
    currentPlayerIndex: winnerIndex,
    message: `${state.players[winnerIndex].name}跑完，所有人明牌`,
    scores: state.players.map((player, index) => (index === winnerIndex ? `${player.name} 获胜` : `${player.name} 剩 ${player.hand.length} 张`)),
    players: state.players.map((player) => ({ ...player, status: '明牌' }))
  };
}

function updateHand(players: PlayerState[], index: number, hand: Card[]): PlayerState[] {
  return players.map((player, playerIndex) =>
    playerIndex === index ? { ...player, hand: sortCards(hand), finished: hand.length === 0, status: hand.length === 0 ? '出完' : '等待' } : player
  );
}

function makeRecord(state: RunFastState, cards: Card[], combo: Combo | undefined, label: string, passed = false): TableRecord {
  return {
    id: tableRecordId(),
    playerIndex: state.currentPlayerIndex,
    cards: sortCards(cards),
    combo,
    label,
    passed
  };
}

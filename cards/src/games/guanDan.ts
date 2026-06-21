import { Card, Rank, containsAllCards, makeDeck, removeCards, shuffle, sortCards } from '../core/cards';
import { Combo, canBeatGuanDan, classifyGuanDan, comboEffect, comboLabel } from '../core/rules';
import { chooseAICombo, chooseHintCombo } from './ai';
import { ActionKey, GameModule, GamePhase, PlayerState, TableRecord, TableView, nextActive, tableRecordId } from './types';
import { TableEffect } from '../core/effects';

export interface GuanDanState {
  key: 'guandan';
  phase: GamePhase;
  players: PlayerState[];
  levelRank: Rank;
  currentPlayerIndex: number;
  lastPlay?: TableRecord;
  visibleRecord?: TableRecord;
  tableRecords: Array<TableRecord | undefined>;
  passCount: number;
  message: string;
  scores: string[];
  effect?: TableEffect;
  effectSeq: number;
}

export const guanDanModule: GameModule<GuanDanState> = {
  key: 'guandan',
  title: '掼蛋',
  create,
  view,
  deal,
  legalActions,
  apply,
  hint,
  aiStep,
  isHumanTurn: (state) => state.phase !== 'finished' && state.currentPlayerIndex === 0
};

function create(): GuanDanState {
  const players = ['你', 'AI 左', 'AI 上', 'AI 右'].map<PlayerState>((name, index) => ({
    id: index,
    name,
    isHuman: index === 0,
    team: teamOf(index),
    role: teamOf(index) === 'A' ? 'A队' : 'B队',
    hand: [],
    status: '等待发牌'
  }));
  return {
    key: 'guandan',
    phase: 'idle',
    players,
    levelRank: '2',
    currentPlayerIndex: 0,
    tableRecords: Array(4).fill(undefined),
    passCount: 0,
    message: '点发牌开始',
    scores: [],
    effectSeq: 0
  };
}

function view(state: GuanDanState): TableView {
  return {
    title: '掼蛋',
    subtitle: `4人两副牌 · ${state.levelRank}级 · 红桃${state.levelRank}逢人配`,
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    tableRecords: state.tableRecords,
    visibleRecord: state.visibleRecord,
    message: state.message,
    scores: state.scores,
    effect: state.effect,
    settingsSummary: '你和AI上同队'
  };
}

function deal(state: GuanDanState): GuanDanState {
  const deck = shuffle(makeDeck(2));
  const hands = Array.from({ length: 4 }, (_, index) => sortCards(deck.filter((_, cardIndex) => cardIndex % 4 === index), state.levelRank));
  const first = hands.findIndex((hand) => hand.some((card) => card.rank === state.levelRank && card.suit === 'H'));
  return {
    ...create(),
    players: state.players.map((player, index) => ({ ...player, hand: hands[index], finished: false, status: index === first ? '先出' : '等待' })),
    phase: 'playing',
    currentPlayerIndex: first,
    message: `红桃${state.levelRank}先出`
  };
}

function legalActions(state: GuanDanState, selected: Card[]): ActionKey[] {
  if (state.phase === 'idle' || state.phase === 'finished') return ['deal'];
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const actions: ActionKey[] = ['hint', 'clear'];
  const combo = classifyGuanDan(selected, state.levelRank);
  const previousCombo = state.lastPlay?.combo;
  if (combo && (!previousCombo || canBeatGuanDan(combo, previousCombo, state.levelRank))) {
    actions.push('play');
  }
  if (state.lastPlay) actions.push('pass');
  return actions;
}

function apply(state: GuanDanState, action: ActionKey, selected: Card[]): GuanDanState {
  if (action === 'deal') return deal(state);
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return state;
  if (action === 'pass') return applyPass(state);
  if (action === 'play') return applyPlay(state, selected);
  return state;
}

function hint(state: GuanDanState): Card[] {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const combo = chooseHintCombo({
    ruleset: 'guandan',
    playerIndex: 0,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    levelRank: state.levelRank,
    teamOf
  });
  return combo?.cards ?? [];
}

function aiStep(state: GuanDanState): GuanDanState {
  if (state.phase !== 'playing' || state.currentPlayerIndex === 0) return state;
  const combo = chooseAICombo({
    ruleset: 'guandan',
    playerIndex: state.currentPlayerIndex,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    levelRank: state.levelRank,
    teamOf
  });
  return combo ? applyPlay(state, combo.cards) : applyPass(state);
}

function applyPlay(state: GuanDanState, selected: Card[]): GuanDanState {
  const player = state.players[state.currentPlayerIndex];
  if (!containsAllCards(player.hand, selected)) return state;
  const combo = classifyGuanDan(selected, state.levelRank);
  if (!combo) return { ...state, message: '牌型不合法' };
  if (state.lastPlay?.combo && !canBeatGuanDan(combo, state.lastPlay.combo, state.levelRank)) {
    return { ...state, message: '管不上当前牌' };
  }
  const players = updateHand(state.players, state.currentPlayerIndex, removeCards(player.hand, selected), state.levelRank);
  const record = makeRecord(state, selected, combo, `${player.name}出${comboLabel(combo)}`);
  const next = afterRecord({ ...state, players }, record);
  const winnerTeam = winningTeam(players);
  if (winnerTeam) return finish(next, winnerTeam);
  return {
    ...next,
    currentPlayerIndex: nextActive(players, state.currentPlayerIndex),
    lastPlay: record,
    passCount: 0,
    message: record.label
  };
}

function applyPass(state: GuanDanState): GuanDanState {
  if (!state.lastPlay) return state;
  const record = makeRecord(state, [], undefined, `${state.players[state.currentPlayerIndex].name}过`, true);
  const activeCount = state.players.filter((player) => !player.finished).length;
  const passCount = state.passCount + 1;
  const tableRecords = [...state.tableRecords];
  tableRecords[state.currentPlayerIndex] = record;
  if (passCount >= activeCount - 1) {
    const owner = state.lastPlay.playerIndex;
    return {
      ...state,
      tableRecords,
      currentPlayerIndex: state.players[owner].finished ? nextActive(state.players, owner) : owner,
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

function afterRecord(state: GuanDanState, record: TableRecord): GuanDanState {
  const tableRecords = [...state.tableRecords];
  tableRecords[record.playerIndex] = record;
  const mapping = comboEffect('guandan', record.combo);
  return {
    ...state,
    tableRecords,
    visibleRecord: record,
    effect: mapping ? { id: state.effectSeq + 1, playerIndex: record.playerIndex, ...mapping } : undefined,
    effectSeq: state.effectSeq + 1
  };
}

function finish(state: GuanDanState, winnerTeam: string): GuanDanState {
  return {
    ...state,
    phase: 'finished',
    message: `${winnerTeam}队获胜，所有人明牌`,
    scores: state.players.map((player) => `${player.name} ${teamOf(player.id) === winnerTeam ? '胜' : '负'} · 剩 ${player.hand.length} 张`),
    players: state.players.map((player) => ({ ...player, status: '明牌' }))
  };
}

function updateHand(players: PlayerState[], index: number, hand: Card[], levelRank: Rank): PlayerState[] {
  return players.map((player, playerIndex) =>
    playerIndex === index
      ? { ...player, hand: sortCards(hand, levelRank), finished: hand.length === 0, status: hand.length === 0 ? '出完' : '等待' }
      : player
  );
}

function winningTeam(players: PlayerState[]): string | undefined {
  for (const team of ['A', 'B']) {
    if (players.filter((player) => player.team === team).every((player) => player.finished)) return team;
  }
  return undefined;
}

function teamOf(playerIndex: number): string {
  return playerIndex === 0 || playerIndex === 2 ? 'A' : 'B';
}

function makeRecord(state: GuanDanState, cards: Card[], combo: Combo | undefined, label: string, passed = false): TableRecord {
  return {
    id: tableRecordId(),
    playerIndex: state.currentPlayerIndex,
    cards: sortCards(cards, state.levelRank),
    combo,
    label,
    passed
  };
}

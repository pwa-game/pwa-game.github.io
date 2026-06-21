import { Card, containsAllCards, makeDeck, removeCards, shuffle, sortCards } from '../core/cards';
import { Combo, canBeatDouDizhu, classifyDouDizhu, comboEffect, comboLabel, legalDouDizhu } from '../core/rules';
import { chooseAICombo, chooseHintCombo, estimateTurns } from './ai';
import { ActionKey, GameModule, GamePhase, PlayerState, TableRecord, TableView, nextActive, tableRecordId } from './types';
import { TableEffect } from '../core/effects';

export interface DouDizhuState {
  key: 'doudizhu';
  phase: GamePhase;
  players: PlayerState[];
  bottomCards: Card[];
  currentPlayerIndex: number;
  highestBid: number;
  highestBidderIndex?: number;
  bidTurnCount: number;
  landlordIndex?: number;
  lastPlay?: TableRecord;
  visibleRecord?: TableRecord;
  tableRecords: Array<TableRecord | undefined>;
  passCount: number;
  message: string;
  scores: string[];
  effect?: TableEffect;
  effectSeq: number;
}

export const douDizhuModule: GameModule<DouDizhuState> = {
  key: 'doudizhu',
  title: '斗地主',
  create,
  view,
  deal,
  legalActions,
  apply,
  hint,
  aiStep,
  isHumanTurn: (state) => state.phase !== 'finished' && state.currentPlayerIndex === 0
};

function create(): DouDizhuState {
  const players = ['你', 'AI 左', 'AI 右'].map<PlayerState>((name, index) => ({
    id: index,
    name,
    isHuman: index === 0,
    hand: [],
    status: '等待发牌'
  }));
  return {
    key: 'doudizhu',
    phase: 'idle',
    players,
    bottomCards: [],
    currentPlayerIndex: 0,
    highestBid: 0,
    bidTurnCount: 0,
    tableRecords: Array(3).fill(undefined),
    passCount: 0,
    message: '点发牌开始叫地主',
    scores: [],
    effectSeq: 0
  };
}

function view(state: DouDizhuState): TableView {
  return {
    title: '斗地主',
    subtitle: state.phase === 'bidding' ? `叫分中 · 当前最高 ${state.highestBid || '无'}` : '3人 · 地主农民',
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    tableRecords: state.tableRecords,
    visibleRecord: state.visibleRecord,
    message: state.message,
    scores: state.scores,
    effect: state.effect,
    settingsSummary: state.landlordIndex == null ? '等待地主' : `${state.players[state.landlordIndex].name}是地主`
  };
}

function deal(state: DouDizhuState): DouDizhuState {
  const deck = shuffle(makeDeck(1));
  const hands = [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)].map((hand) => sortCards(hand));
  const bottomCards = sortCards(deck.slice(51));
  const fresh = create();
  return {
    ...fresh,
    players: fresh.players.map((player, index) => ({ ...player, hand: hands[index], status: '叫分' })),
    bottomCards,
    phase: 'bidding',
    currentPlayerIndex: Math.floor(Math.random() * 3),
    message: '开始叫地主'
  };
}

function legalActions(state: DouDizhuState, selected: Card[]): ActionKey[] {
  if (state.phase === 'idle' || state.phase === 'finished') return ['deal'];
  if (state.currentPlayerIndex !== 0) return [];
  if (state.phase === 'bidding') {
    const actions: ActionKey[] = ['bid0'];
    if (state.highestBid < 1) actions.push('bid1');
    if (state.highestBid < 2) actions.push('bid2');
    if (state.highestBid < 3) actions.push('bid3');
    return actions;
  }
  if (state.phase !== 'playing') return [];
  const actions: ActionKey[] = ['hint', 'clear'];
  const combo = classifyDouDizhu(selected);
  const previousCombo = state.lastPlay?.combo;
  if (combo && (!previousCombo || canBeatDouDizhu(combo, previousCombo))) {
    actions.push('play');
  }
  if (state.lastPlay) actions.push('pass');
  return actions;
}

function apply(state: DouDizhuState, action: ActionKey, selected: Card[]): DouDizhuState {
  if (action === 'deal') return deal(state);
  if (state.currentPlayerIndex !== 0) return state;
  if (state.phase === 'bidding') {
    if (action === 'bid0') return applyBid(state, 0);
    if (action === 'bid1') return applyBid(state, 1);
    if (action === 'bid2') return applyBid(state, 2);
    if (action === 'bid3') return applyBid(state, 3);
  }
  if (state.phase === 'playing') {
    if (action === 'pass') return applyPass(state);
    if (action === 'play') return applyPlay(state, selected);
  }
  return state;
}

function hint(state: DouDizhuState): Card[] {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const combo = chooseHintCombo({
    ruleset: 'doudizhu',
    playerIndex: 0,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    landlordIndex: state.landlordIndex
  });
  return combo?.cards ?? [];
}

function aiStep(state: DouDizhuState): DouDizhuState {
  if (state.phase === 'bidding' && state.currentPlayerIndex !== 0) {
    return applyBid(state, chooseBid(state, state.currentPlayerIndex));
  }
  if (state.phase !== 'playing' || state.currentPlayerIndex === 0) return state;
  const combo = chooseAICombo({
    ruleset: 'doudizhu',
    playerIndex: state.currentPlayerIndex,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    landlordIndex: state.landlordIndex
  });
  return combo ? applyPlay(state, combo.cards) : applyPass(state);
}

function applyBid(state: DouDizhuState, value: number): DouDizhuState {
  const player = state.players[state.currentPlayerIndex];
  const bidValue = Math.max(0, Math.min(3, value));
  let highestBid = state.highestBid;
  let highestBidderIndex = state.highestBidderIndex;
  if (bidValue > state.highestBid) {
    highestBid = bidValue;
    highestBidderIndex = state.currentPlayerIndex;
  }
  const tableRecords = [...state.tableRecords];
  tableRecords[state.currentPlayerIndex] = {
    id: tableRecordId(),
    playerIndex: state.currentPlayerIndex,
    cards: [],
    label: bidValue === 0 ? `${player.name}不叫` : `${player.name}叫${bidValue}分`,
    passed: bidValue === 0
  };
  const nextState = {
    ...state,
    highestBid,
    highestBidderIndex,
    tableRecords,
    bidTurnCount: state.bidTurnCount + 1,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % 3,
    message: tableRecords[state.currentPlayerIndex]!.label
  };
  if (bidValue === 3) return becomeLandlord(nextState, state.currentPlayerIndex);
  if (nextState.bidTurnCount >= 3) {
    return becomeLandlord(nextState, highestBidderIndex ?? state.currentPlayerIndex);
  }
  return nextState;
}

function becomeLandlord(state: DouDizhuState, landlordIndex: number): DouDizhuState {
  const players = state.players.map((player, index) => ({
    ...player,
    role: index === landlordIndex ? '地主' : '农民',
    team: index === landlordIndex ? 'landlord' : 'farmer',
    status: index === landlordIndex ? '地主先出' : '等待',
    hand: index === landlordIndex ? sortCards([...player.hand, ...state.bottomCards]) : player.hand
  }));
  return {
    ...state,
    phase: 'playing',
    players,
    landlordIndex,
    currentPlayerIndex: landlordIndex,
    highestBid: Math.max(1, state.highestBid),
    tableRecords: Array(3).fill(undefined),
    lastPlay: undefined,
    passCount: 0,
    message: `${players[landlordIndex].name}成为地主`
  };
}

function applyPlay(state: DouDizhuState, selected: Card[]): DouDizhuState {
  const player = state.players[state.currentPlayerIndex];
  if (!containsAllCards(player.hand, selected)) return state;
  const combo = classifyDouDizhu(selected);
  if (!combo) return { ...state, message: '牌型不合法' };
  if (state.lastPlay?.combo && !canBeatDouDizhu(combo, state.lastPlay.combo)) {
    return { ...state, message: '管不上当前牌' };
  }
  const players = updateHand(state.players, state.currentPlayerIndex, removeCards(player.hand, selected));
  const record = makeRecord(state, selected, combo, `${player.name}出${comboLabel(combo)}`);
  const next = afterRecord({ ...state, players }, record);
  if (players[state.currentPlayerIndex].hand.length === 0) return finish(next, state.currentPlayerIndex);
  return {
    ...next,
    currentPlayerIndex: nextActive(players, state.currentPlayerIndex),
    lastPlay: record,
    passCount: 0,
    message: record.label
  };
}

function applyPass(state: DouDizhuState): DouDizhuState {
  if (!state.lastPlay) return state;
  const player = state.players[state.currentPlayerIndex];
  const record = makeRecord(state, [], undefined, `${player.name}过`, true);
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

function chooseBid(state: DouDizhuState, playerIndex: number): number {
  const hand = state.players[playerIndex].hand;
  const turns = estimateTurns(hand, 'doudizhu');
  const highCards = hand.filter((card) => ['2', 'SJ', 'BJ', 'A'].includes(card.rank)).length;
  const bombs = legalDouDizhu(hand).filter((combo) => combo.kind === 'bomb' || combo.kind === 'rocket').length;
  const strength = highCards + bombs * 4 + Math.max(0, 9 - turns);
  if (state.bidTurnCount >= 2 && state.highestBid === 0) return 1;
  if (strength > 12 && state.highestBid < 3) return 3;
  if (strength > 9 && state.highestBid < 2) return 2;
  if (strength > 6 && state.highestBid < 1) return 1;
  return 0;
}

function afterRecord(state: DouDizhuState, record: TableRecord): DouDizhuState {
  const tableRecords = [...state.tableRecords];
  tableRecords[record.playerIndex] = record;
  const mapping = comboEffect('doudizhu', record.combo);
  return {
    ...state,
    tableRecords,
    visibleRecord: record,
    effect: mapping ? { id: state.effectSeq + 1, playerIndex: record.playerIndex, ...mapping } : undefined,
    effectSeq: state.effectSeq + 1
  };
}

function finish(state: DouDizhuState, winnerIndex: number): DouDizhuState {
  const landlordWon = winnerIndex === state.landlordIndex;
  const scores = state.players.map((player, index) => {
    const won = landlordWon ? index === state.landlordIndex : index !== state.landlordIndex;
    return `${player.name} ${won ? '胜' : '负'} · 剩 ${player.hand.length} 张`;
  });
  return {
    ...state,
    phase: 'finished',
    currentPlayerIndex: winnerIndex,
    message: `${state.players[winnerIndex].name}出完，${landlordWon ? '地主' : '农民'}获胜，所有人明牌`,
    scores,
    players: state.players.map((player) => ({ ...player, status: '明牌' }))
  };
}

function updateHand(players: PlayerState[], index: number, hand: Card[]): PlayerState[] {
  return players.map((player, playerIndex) =>
    playerIndex === index ? { ...player, hand: sortCards(hand), finished: hand.length === 0, status: hand.length === 0 ? '出完' : '等待' } : player
  );
}

function makeRecord(state: DouDizhuState, cards: Card[], combo: Combo | undefined, label: string, passed = false): TableRecord {
  return {
    id: tableRecordId(),
    playerIndex: state.currentPlayerIndex,
    cards: sortCards(cards),
    combo,
    label,
    passed
  };
}

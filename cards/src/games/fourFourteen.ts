import { Card, Rank, containsAllCards, countRank, makeDeck, rankLabel, removeCards, runRanks, shuffle, sortCards } from '../core/cards';
import { PublicCardMemory } from '../core/publicMemory';
import { Combo, canBeat414, classify414, comboEffect, comboLabel, legal414 } from '../core/rules';
import { chooseAICombo, chooseHintCombo } from './ai';
import { ActionKey, GameModule, GamePhase, PlayerState, ScoreLine, TableRecord, TableView, nextActive, tableRecordId } from './types';
import { TableEffect } from '../core/effects';

export type FourFourteenAIStyle = 'relaxed' | 'competitive';

export interface FourFourteenSettings {
  playerCount: 3 | 4;
  deckCount: 1 | 2 | 3;
  aiStyle: FourFourteenAIStyle;
}

interface ReactionState {
  kind: 'cha' | 'gou';
  targetRank: Rank;
  sourcePlayerIndex: number;
  normalPlayPlayerIndex?: number;
  remainingPlayers: number[];
}

export interface FourFourteenState {
  key: '414';
  settings: FourFourteenSettings;
  nextSettings?: FourFourteenSettings;
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerIndex: number;
  dealTargetHands?: Card[][];
  visibleHandCounts?: number[];
  dealReady?: boolean;
  lastPlay?: TableRecord;
  visibleRecord?: TableRecord;
  tableRecords: Array<TableRecord | undefined>;
  passCount: number;
  reaction?: ReactionState;
  message: string;
  scores: string[];
  scoreLines: ScoreLine[];
  cardsPlayedCount: number[];
  eventLog: TableRecord[];
  effect?: TableEffect;
  effectSeq: number;
}

const defaultSettings: FourFourteenSettings = {
  playerCount: 3,
  deckCount: 1,
  aiStyle: 'relaxed'
};

export const fourFourteenModule: GameModule<FourFourteenState> = {
  key: '414',
  title: '414',
  create: () => createFourFourteenState(defaultSettings),
  view,
  deal,
  dealStep,
  legalActions,
  apply,
  hint,
  bestHint,
  aiStep,
  isHumanTurn: (state) => state.phase === 'playing' && state.currentPlayerIndex === 0,
  setOption
};

function createFourFourteenState(settings: FourFourteenSettings): FourFourteenState {
  const players = names(settings.playerCount).map<PlayerState>((name, index) => ({
    id: index,
    name,
    isHuman: index === 0,
    hand: [],
    status: index === 0 ? '等待发牌' : '等待'
  }));
  return {
    key: '414',
    settings,
    nextSettings: settings,
    phase: 'idle',
    players,
    currentPlayerIndex: 0,
    tableRecords: Array(settings.playerCount).fill(undefined),
    passCount: 0,
    message: '点发牌开始',
    scores: [],
    scoreLines: [],
    cardsPlayedCount: Array(settings.playerCount).fill(0),
    eventLog: [],
    effectSeq: 0
  };
}

function view(state: FourFourteenState): TableView {
  const optionSettings = state.nextSettings ?? state.settings;
  return {
    title: '414',
    subtitle: `${state.settings.playerCount}人 · ${state.settings.deckCount}副 · ${state.settings.aiStyle === 'relaxed' ? '休闲 AI' : '竞技 AI'}`,
    phase: state.phase,
    players: state.players.map((player, index) => ({ ...player, status: playerStatusText(state, index) })),
    currentPlayerIndex: state.currentPlayerIndex,
    tableRecords: state.tableRecords,
    visibleRecord: state.visibleRecord,
    latestRecord: state.eventLog[state.eventLog.length - 1],
    message: state.message,
    promptText: promptText(state),
    scores: state.scores,
    scoreLines: state.scoreLines,
    effect: state.effect,
    settingsSummary: `${optionSettings.playerCount}人 / ${optionSettings.deckCount}副 / ${optionSettings.aiStyle === 'relaxed' ? '休闲' : '竞技'}`
  };
}

function promptText(state: FourFourteenState): string {
  if (state.phase === 'idle') return '点发牌开始';
  if (state.phase === 'dealing') return '正在发牌...';
  if (state.phase === 'finished') return '游戏结束';

  const player = state.players[state.currentPlayerIndex];
  if (!player) return '游戏结束';

  if (state.reaction?.kind === 'cha') {
    return player.isHuman ? `${player.name}可以叉${rankLabel(state.reaction.targetRank)}` : `${player.name}思考中`;
  }
  if (state.reaction?.kind === 'gou') {
    return player.isHuman ? `${player.name}可以勾${rankLabel(state.reaction.targetRank)}` : `${player.name}思考中`;
  }
  if (!state.lastPlay) return `${player.name}起手`;
  return `${player.name}跟牌或过`;
}

function playerStatusText(state: FourFourteenState, playerIndex: number): string {
  if (state.phase === 'idle') return '待发牌';
  if (state.phase === 'dealing') return '发牌中';
  if (state.phase === 'finished') return state.currentPlayerIndex === playerIndex ? '赢家' : '结束';

  if (state.currentPlayerIndex !== playerIndex) return '等待';
  if (state.reaction?.kind === 'cha') return state.players[playerIndex]?.isHuman ? '可叉' : '思考';
  if (state.reaction?.kind === 'gou') return state.players[playerIndex]?.isHuman ? '可勾' : '思考';
  return state.lastPlay ? '跟牌' : '起手';
}

function deal(state: FourFourteenState): FourFourteenState {
  const settings = state.nextSettings ?? state.settings;
  const deck = shuffle(makeDeck(settings.deckCount));
  const hands = Array.from({ length: settings.playerCount }, () => [] as Card[]);
  deck.forEach((card, index) => {
    hands[index % settings.playerCount].push(card);
  });
  const targetHands = hands.map((hand) => sortCards(hand));
  const first = targetHands.findIndex((hand) => hand.some((card) => card.rank === '3' && card.suit === 'H'));
  const players = names(settings.playerCount).map<PlayerState>((name, index) => ({
    id: index,
    name,
    isHuman: index === 0,
    hand: [],
    finished: false,
    status: '发牌中'
  }));
  return {
    ...state,
    settings,
    nextSettings: settings,
    phase: 'dealing',
    players,
    currentPlayerIndex: first,
    dealTargetHands: targetHands,
    visibleHandCounts: Array(settings.playerCount).fill(0),
    dealReady: false,
    lastPlay: undefined,
    visibleRecord: undefined,
    tableRecords: Array(settings.playerCount).fill(undefined),
    passCount: 0,
    reaction: undefined,
    message: '正在发牌...',
    scores: [],
    scoreLines: [],
    cardsPlayedCount: Array(settings.playerCount).fill(0),
    eventLog: [],
    effect: undefined
  };
}

function dealStep(state: FourFourteenState): FourFourteenState {
  if (state.phase !== 'dealing' || !state.dealTargetHands || !state.visibleHandCounts) return state;
  if (state.dealReady) {
    const finalPlayers = state.players.map((player, index) => ({
      ...player,
      hand: state.dealTargetHands![index],
      status: index === state.currentPlayerIndex ? '先出' : '等待'
    }));
    const message = `红桃3在${finalPlayers[state.currentPlayerIndex].name}手中，${finalPlayers[state.currentPlayerIndex].name}先出`;
    const systemRecord = makeSystemRecord(-1, message, 'leadStart');
    return {
      ...state,
      phase: 'playing',
      players: finalPlayers,
      dealTargetHands: undefined,
      visibleHandCounts: undefined,
      dealReady: undefined,
      visibleRecord: systemRecord,
      eventLog: [...state.eventLog, systemRecord],
      message
    };
  }

  const increment = Math.max(1, state.settings.deckCount);
  const visibleHandCounts = state.visibleHandCounts.map((count, index) =>
    Math.min(state.dealTargetHands![index].length, count + increment)
  );
  const players = state.players.map((player, index) => ({
    ...player,
    hand: state.dealTargetHands![index].slice(0, visibleHandCounts[index]),
    status: '发牌中'
  }));
  const complete = visibleHandCounts.every((count, index) => count >= state.dealTargetHands![index].length);
  if (!complete) {
    return {
      ...state,
      visibleHandCounts,
      players,
      message: '正在发牌...'
    };
  }

  const readyPlayers = players.map((player, index) => ({
    ...player,
    hand: state.dealTargetHands![index],
    status: '发牌中'
  }));
  return {
    ...state,
    visibleHandCounts,
    players: readyPlayers,
    dealReady: true,
    message: '发牌完成'
  };
}

function legalActions(state: FourFourteenState, selected: Card[]): ActionKey[] {
  if (state.phase === 'idle' || state.phase === 'finished') return ['deal'];
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  const actions: ActionKey[] = ['hint', 'clear'];
  if (state.reaction) {
    const hand = state.players[0].hand;
    actions.push('pass');
    if (state.reaction.kind === 'cha' && (canCha(selected, state.reaction.targetRank) || findSameRank(hand, state.reaction.targetRank, 2))) actions.push('cha');
    if (state.reaction.kind === 'gou' && (canGou(selected, state.reaction.targetRank) || findSameRank(hand, state.reaction.targetRank, 1))) actions.push('gou');
    return actions;
  }
  if (selected.length > 0) actions.push('play');
  if (state.lastPlay) actions.push('pass');
  return actions;
}

function apply(state: FourFourteenState, action: ActionKey, selected: Card[]): FourFourteenState {
  if (action === 'deal') return deal(state);
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return state;
  if (state.reaction) {
    if (action === 'pass') return applyPass(state);
    if (action === 'cha' && state.reaction.kind === 'cha') {
      const resolved = resolveHumanReactionCards(state, selected, 'cha');
      if (resolved.message) return { ...state, message: resolved.message };
      return resolved.cards ? applyReactionPlay(state, resolved.cards, 'cha') : state;
    }
    if (action === 'gou' && state.reaction.kind === 'gou') {
      const resolved = resolveHumanReactionCards(state, selected, 'gou');
      if (resolved.message) return { ...state, message: resolved.message };
      return resolved.cards ? applyReactionPlay(state, resolved.cards, 'gou') : state;
    }
    return state;
  }
  if (action === 'pass') return applyPass(state);
  if (action === 'play') {
    return applyPlay(state, selected);
  }
  return state;
}

function resolveHumanReactionCards(
  state: FourFourteenState,
  selected: Card[],
  kind: 'cha' | 'gou'
): { cards?: Card[]; message?: string } {
  const reaction = state.reaction;
  if (!reaction || reaction.kind !== kind) return {};
  const hand = state.players[0].hand;
  const needed = kind === 'cha' ? 2 : 1;
  const matchesReaction = kind === 'cha' ? canCha(selected, reaction.targetRank) : canGou(selected, reaction.targetRank);

  if (selected.length === needed) {
    if (!containsAllCards(hand, selected)) return { message: '选中的牌不在手牌中' };
    if (!matchesReaction) return { message: '当前不能这样出' };
    return { cards: selected };
  }

  const cards = findSameRank(hand, reaction.targetRank, needed);
  return cards ? { cards } : {};
}

function hint(state: FourFourteenState): Card[] {
  return quickHint(state);
}

function bestHint(state: FourFourteenState): Card[] {
  const quick = quickHint(state);
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return quick;
  if (state.reaction || shouldUseQuickHintOnly(state)) return quick;

  const combo = chooseAICombo({
    ruleset: '414',
    playerIndex: 0,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    deckCount: state.settings.deckCount,
    style: 'competitive',
    visibleCards: state.eventLog.flatMap((record) => record.cards),
    cardsPlayedCount: state.cardsPlayedCount,
    passCount: state.passCount
  });
  return combo?.cards ?? quick;
}

function quickHint(state: FourFourteenState): Card[] {
  if (state.phase !== 'playing' || state.currentPlayerIndex !== 0) return [];
  if (state.reaction?.kind === 'cha') {
    const pair = findSameRank(state.players[0].hand, state.reaction.targetRank, 2);
    return pair ?? [];
  }
  if (state.reaction?.kind === 'gou') {
    const single = findSameRank(state.players[0].hand, state.reaction.targetRank, 1);
    return single ?? [];
  }
  const combo = chooseHintCombo({
    ruleset: '414',
    playerIndex: 0,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    deckCount: state.settings.deckCount,
    style: 'competitive',
    visibleCards: state.eventLog.flatMap((record) => record.cards),
    cardsPlayedCount: state.cardsPlayedCount,
    passCount: state.passCount
  });
  return combo?.cards ?? [];
}

function shouldUseQuickHintOnly(state: FourFourteenState): boolean {
  let legalActionCount = 0;
  if (state.reaction?.kind === 'cha') {
    legalActionCount = findSameRank(state.players[0].hand, state.reaction.targetRank, 2) ? 2 : 1;
  } else if (state.reaction?.kind === 'gou') {
    legalActionCount = findSameRank(state.players[0].hand, state.reaction.targetRank, 1) ? 2 : 1;
  } else {
    legalActionCount = legal414(state.players[0].hand, state.lastPlay?.combo).length + (state.lastPlay ? 1 : 0);
  }

  if (state.settings.deckCount > 1 && legalActionCount > 28) return true;
  return legalActionCount > 48;
}

function aiStep(state: FourFourteenState): FourFourteenState {
  if (state.phase !== 'playing' || state.currentPlayerIndex === 0) return state;
  if (state.reaction) {
    const selected = chooseReactionCards(state, state.currentPlayerIndex);
    if (!selected) return applyPass(state);
    return applyReactionPlay(state, selected, state.reaction.kind);
  }
  const combo = chooseAICombo({
    ruleset: '414',
    playerIndex: state.currentPlayerIndex,
    hands: state.players.map((player) => player.hand),
    previous: state.lastPlay?.combo,
    previousPlayerIndex: state.lastPlay?.playerIndex,
    deckCount: state.settings.deckCount,
    style: state.settings.aiStyle,
    visibleCards: state.eventLog.flatMap((record) => record.cards),
    cardsPlayedCount: state.cardsPlayedCount,
    passCount: state.passCount
  });
  if (!combo) return applyPass(state);
  return applyPlay(state, combo.cards);
}

function applyPlay(state: FourFourteenState, selected: Card[]): FourFourteenState {
  const player = state.players[state.currentPlayerIndex];
  if (!containsAllCards(player.hand, selected)) return state;
  const combo = classify414(selected);
  if (!combo) return { ...state, message: '牌型不合法' };
  if (state.lastPlay?.combo && !canBeat414(combo, state.lastPlay.combo)) {
    return { ...state, message: '管不上当前牌' };
  }
  const players = updateHand(state.players, state.currentPlayerIndex, removeCards(player.hand, selected));
  const record = makeRecord(state, selected, combo, `${player.name}出${comboLabel(combo)}`);
  const nextState = afterRecord(
    {
      ...state,
      players,
      tableRecords: startsFreshLead(state) ? emptyTableRecords(state.players.length) : state.tableRecords,
      cardsPlayedCount: incrementPlayedCount(state, state.currentPlayerIndex, selected.length)
    },
    record,
    true
  );
  if (players[state.currentPlayerIndex].hand.length === 0) return finish(nextState, state.currentPlayerIndex);
  const followState = {
    ...nextState,
    passCount: 0,
    lastPlay: record
  };
  if (combo.kind === 'single') {
    const reactionPlayers = eligibleReactionPlayers('cha', combo.primaryRank, state.currentPlayerIndex, players);
    if (reactionPlayers.length > 0) {
      return {
        ...followState,
        reaction: {
          kind: 'cha',
          targetRank: combo.primaryRank,
          sourcePlayerIndex: state.currentPlayerIndex,
          normalPlayPlayerIndex: state.currentPlayerIndex,
          remainingPlayers: reactionPlayers
        },
        currentPlayerIndex: reactionPlayers[0],
        message: `${record.label}，等待叉`
      };
    }
  }
  return {
    ...followState,
    currentPlayerIndex: nextActive(players, state.currentPlayerIndex),
    message: record.label
  };
}

function applyReactionPlay(state: FourFourteenState, selected: Card[], kind: 'cha' | 'gou'): FourFourteenState {
  const reaction = state.reaction;
  if (!reaction) return state;
  const player = state.players[state.currentPlayerIndex];
  if (!containsAllCards(player.hand, selected)) return { ...state, message: '选中的牌不在手牌中' };
  if (kind === 'cha' && !canCha(selected, reaction.targetRank)) return { ...state, message: '当前不能这样出' };
  if (kind === 'gou' && !canGou(selected, reaction.targetRank)) return { ...state, message: '当前不能这样出' };
  const combo: Combo = {
    kind,
    cards: sortCards(selected),
    primaryRank: reaction.targetRank
  };
  const players = updateHand(state.players, state.currentPlayerIndex, removeCards(player.hand, selected));
  const reactionLabel = kind === 'cha' ? '叉' : '勾';
  const record = makeRecord(state, selected, combo, `${player.name}${reactionLabel}${rankLabel(reaction.targetRank)}`);
  const next = afterRecord(
    {
      ...state,
      players,
      cardsPlayedCount: incrementPlayedCount(state, state.currentPlayerIndex, selected.length)
    },
    record,
    true
  );
  if (players[state.currentPlayerIndex].hand.length === 0) return finish(next, state.currentPlayerIndex);
  if (kind === 'cha') {
    const remaining = eligibleReactionPlayers('gou', reaction.targetRank, state.currentPlayerIndex, players);
    if (remaining.length === 0) {
      const systemRecord = makeSystemRecord(state.currentPlayerIndex, `无人勾，${player.name}死叉后起手`, 'deadCha');
      const tableRecords = emptyTableRecords(players.length);
      tableRecords[state.currentPlayerIndex] = record;
      return {
        ...next,
        tableRecords,
        visibleRecord: systemRecord,
        eventLog: [...next.eventLog, systemRecord],
        reaction: undefined,
        currentPlayerIndex: state.currentPlayerIndex,
        passCount: 0,
        lastPlay: undefined,
        message: systemRecord.label
      };
    }
    return {
      ...next,
      reaction: { kind: 'gou', targetRank: reaction.targetRank, sourcePlayerIndex: state.currentPlayerIndex, remainingPlayers: remaining },
      currentPlayerIndex: remaining[0],
      passCount: 0,
      message: `${player.name}叉${rankLabel(reaction.targetRank)}，等待勾`
    };
  }
  return {
    ...next,
    reaction: undefined,
    currentPlayerIndex: state.currentPlayerIndex,
    passCount: 0,
    lastPlay: undefined,
    message: `${player.name}勾${rankLabel(reaction.targetRank)}，重新起手`
  };
}

function applyPass(state: FourFourteenState): FourFourteenState {
  if (state.reaction) {
    const [, ...rest] = state.reaction.remainingPlayers;
    if (rest.length === 0) {
      if (state.reaction.kind === 'cha') {
        const normalPlayer = state.reaction.normalPlayPlayerIndex ?? state.reaction.sourcePlayerIndex;
        const nextPlayer = nextActive(state.players, normalPlayer);
        return {
          ...state,
          reaction: undefined,
          currentPlayerIndex: nextPlayer,
          passCount: 0,
          message: `${state.players[nextPlayer].name}跟牌或过`
        };
      }
      const owner = state.reaction.sourcePlayerIndex;
      const systemRecord = makeSystemRecord(owner, `无人勾，${state.players[owner].name}死叉后起手`, 'deadCha');
      const tableRecords = emptyTableRecords(state.players.length);
      tableRecords[owner] = state.tableRecords[owner];
      return {
        ...state,
        tableRecords,
        visibleRecord: systemRecord,
        eventLog: [...state.eventLog, systemRecord],
        reaction: undefined,
        currentPlayerIndex: owner,
        lastPlay: undefined,
        passCount: 0,
        message: systemRecord.label
      };
    }
    return {
      ...state,
      reaction: { ...state.reaction, remainingPlayers: rest },
      currentPlayerIndex: rest[0],
      message: reactionPromptMessage(state.reaction, state.players[rest[0]])
    };
  }
  if (!state.lastPlay) return state;
  const player = state.players[state.currentPlayerIndex];
  const record = makeRecord(state, [], undefined, `${player.name}过`, true);
  const passCount = state.passCount + 1;
  const tableRecords = [...state.tableRecords];
  tableRecords[state.currentPlayerIndex] = record;
  if (passCount >= state.players.filter((p) => !p.finished).length - 1) {
    const owner = state.lastPlay.playerIndex;
    const systemRecord = makeSystemRecord(owner, `${state.players.length - 1}家过牌，${state.players[owner].name}重新起手`, 'relead');
    const nextTableRecords = emptyTableRecords(state.players.length);
    nextTableRecords[owner] = tableRecords[owner];
    return {
      ...state,
      tableRecords: nextTableRecords,
      visibleRecord: systemRecord,
      eventLog: [...state.eventLog, record, systemRecord],
      currentPlayerIndex: owner,
      lastPlay: undefined,
      passCount: 0,
      message: systemRecord.label
    };
  }
  return {
    ...state,
    tableRecords,
    visibleRecord: record,
    eventLog: [...state.eventLog, record],
    currentPlayerIndex: nextActive(state.players, state.currentPlayerIndex),
    passCount,
    message: record.label
  };
}

function setOption(state: FourFourteenState, option: string, value: string | number): FourFourteenState {
  if (state.phase === 'dealing') return state;
  const settings = { ...(state.nextSettings ?? state.settings) };
  if (option === 'playerCount') settings.playerCount = Number(value) === 4 ? 4 : 3;
  if (option === 'deckCount') settings.deckCount = Math.max(1, Math.min(3, Number(value))) as 1 | 2 | 3;
  if (option === 'aiStyle') settings.aiStyle = value === 'competitive' ? 'competitive' : 'relaxed';
  if (state.phase === 'idle') return createFourFourteenState(settings);
  return {
    ...state,
    nextSettings: settings
  };
}

function chooseReactionCards(state: FourFourteenState, playerIndex: number): Card[] | undefined {
  const reaction = state.reaction!;
  const hand = state.players[playerIndex].hand;
  const count = reaction.kind === 'cha' ? 2 : 1;
  const cards = findSameRank(hand, reaction.targetRank, count);
  if (!cards) return undefined;
  const pressure = Math.min(...state.players.map((player, index) => (index === playerIndex || player.hand.length === 0 ? 99 : player.hand.length)));
  const memory = new PublicCardMemory({
    deckCount: state.settings.deckCount,
    ownCards: hand,
    visibleCards: state.eventLog.flatMap((record) => record.cards),
    opponentHandCounts: state.players
      .filter((_, index) => index !== playerIndex)
      .map((player) => player.hand.length)
  });
  const currentControllerCards = state.players[reaction.sourcePlayerIndex]?.hand.length ?? 99;
  const currentControllerIsImmediateThreat = currentControllerCards > 0 && currentControllerCards <= 1;
  if (cards.length === hand.length) return cards;
  if (state.settings.aiStyle === 'relaxed' && pressure > 3 && !currentControllerIsImmediateThreat) return undefined;
  if (reaction.kind === 'cha' && reaction.targetRank === '2' && memory.opponentsCanGou('2') && !currentControllerIsImmediateThreat) return undefined;
  const groupSize = hand.filter((card) => card.rank === reaction.targetRank).length;
  if (reaction.kind === 'gou' && breaksImportantSingleRun(hand, cards[0])) return undefined;
  if (groupSize >= 3 && reaction.kind === 'gou' && pressure > 2) return undefined;
  return cards;
}

function breaksImportantSingleRun(hand: Card[], card: Card): boolean {
  if (!runRanks.includes(card.rank)) return false;
  if (countRank(hand, card.rank) > 1) return false;
  return longestSingleRunLength(hand) >= 5 && longestSingleRunLength(removeCards(hand, [card])) < 5;
}

function longestSingleRunLength(cards: Card[]): number {
  const rankSet = new Set(cards.map((card) => card.rank).filter((rank) => runRanks.includes(rank)));
  let longest = 0;
  let current = 0;
  for (const rank of runRanks) {
    if (rankSet.has(rank)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function canCha(cards: Card[], rank: Rank): boolean {
  return cards.length === 2 && cards.every((card) => card.rank === rank);
}

function canGou(cards: Card[], rank: Rank): boolean {
  return cards.length === 1 && cards[0].rank === rank;
}

function findSameRank(hand: Card[], rank: Rank, count: number): Card[] | undefined {
  const cards = sortCards(hand.filter((card) => card.rank === rank));
  return cards.length >= count ? cards.slice(0, count) : undefined;
}

function reactionPromptMessage(reaction: ReactionState, player: PlayerState | undefined): string {
  if (!player) return '思考中';
  if (!player.isHuman) return `${player.name}思考中`;
  const action = reaction.kind === 'cha' ? '叉' : '勾';
  return `${player.name}可以${action}${rankLabel(reaction.targetRank)}`;
}

function afterRecord(state: FourFourteenState, record: TableRecord, visible: boolean): FourFourteenState {
  const tableRecords = [...state.tableRecords];
  tableRecords[record.playerIndex] = record;
  const effectMapping = comboEffect('414', record.combo);
  const playerName = state.players[record.playerIndex]?.name;
  return {
    ...state,
    tableRecords,
    visibleRecord: visible ? record : state.visibleRecord,
    eventLog: [...state.eventLog, record],
    effect: effectMapping
      ? {
          id: state.effectSeq + 1,
          playerIndex: record.playerIndex,
          ...effectMapping,
          subtitle: effectSubtitle(effectMapping.subtitle, playerName)
        }
      : undefined,
    effectSeq: state.effectSeq + 1
  };
}

function effectSubtitle(subtitle: string | undefined, playerName: string | undefined): string | undefined {
  if (!playerName) return subtitle;
  return subtitle ? `${playerName} · ${subtitle}` : playerName;
}

function makeRecord(state: FourFourteenState, cards: Card[], combo: Combo | undefined, label: string, passed = false): TableRecord {
  return {
    id: tableRecordId(),
    playerIndex: state.currentPlayerIndex,
    cards: sortCards(cards),
    combo,
    label,
    passed
  };
}

function makeSystemRecord(playerIndex: number, label: string, system: 'leadStart' | 'relead' | 'deadCha' | 'gameOver'): TableRecord {
  return {
    id: tableRecordId(),
    playerIndex,
    cards: [],
    label,
    system
  };
}

function finish(state: FourFourteenState, winnerIndex: number): FourFourteenState {
  const scoreLines = makeScoreLines(state, winnerIndex);
  const systemRecord = makeSystemRecord(-1, `${state.players[winnerIndex].name}率先出完，游戏结束`, 'gameOver');
  const scores = scoreLines.map((score) =>
    score.penalty === 0
      ? `${score.playerName} 赢家`
      : `${score.playerName} ${score.remainingCards}张 x${score.multiplier} = ${score.penalty}`
  );
  return {
    ...state,
    phase: 'finished',
    currentPlayerIndex: winnerIndex,
    visibleRecord: systemRecord,
    eventLog: [...state.eventLog, systemRecord],
    message: systemRecord.label,
    scores,
    scoreLines,
    effect: undefined,
    reaction: undefined,
    lastPlay: undefined,
    players: state.players.map((player, index) => ({ ...player, status: index === winnerIndex ? '赢家' : '明牌' }))
  };
}

function makeScoreLines(state: FourFourteenState, winnerIndex: number): ScoreLine[] {
  return state.players.map((player, index) => {
    if (index === winnerIndex) {
      return {
        playerIndex: index,
        playerName: player.name,
        remainingCards: 0,
        multiplier: 0,
        penalty: 0,
        notes: ['赢家']
      };
    }
    const hand = player.hand;
    let multiplier = 1;
    const notes: string[] = [];
    if (containsRocket414(hand) || containsDoubleJoker(hand)) {
      multiplier *= 2;
      notes.push('留有4A4或双王');
    }
    if ((state.cardsPlayedCount[index] ?? 0) === 0) {
      multiplier *= 2;
      notes.push('未出过牌');
    }
    const penalty = player.hand.length * multiplier;
    return {
      playerIndex: index,
      playerName: player.name,
      remainingCards: player.hand.length,
      multiplier,
      penalty,
      notes
    };
  });
}

function containsRocket414(hand: Card[]): boolean {
  return countRank(hand, '4') >= 2 && countRank(hand, 'A') >= 1;
}

function containsDoubleJoker(hand: Card[]): boolean {
  return countRank(hand, 'SJ') >= 1 && countRank(hand, 'BJ') >= 1;
}

function startsFreshLead(state: FourFourteenState): boolean {
  return !state.lastPlay && !state.reaction;
}

function emptyTableRecords(count: number): Array<TableRecord | undefined> {
  return Array(count).fill(undefined);
}

function incrementPlayedCount(state: FourFourteenState, playerIndex: number, cardCount: number): number[] {
  const counts = [...state.cardsPlayedCount];
  counts[playerIndex] = (counts[playerIndex] ?? 0) + cardCount;
  return counts;
}

function updateHand(players: PlayerState[], index: number, hand: Card[]): PlayerState[] {
  return players.map((player, playerIndex) =>
    playerIndex === index
      ? {
          ...player,
          hand: sortCards(hand),
          status: hand.length === 0 ? '出完' : '等待',
          finished: hand.length === 0
        }
      : player
  );
}

function reactionOrder(source: number, playerCount: number): number[] {
  return Array.from({ length: playerCount - 1 }, (_, offset) => (source + offset + 1) % playerCount);
}

function eligibleReactionPlayers(kind: 'cha' | 'gou', rank: Rank, source: number, players: PlayerState[]): number[] {
  return reactionOrder(source, players.length).filter((index) => {
    if (players[index].finished) return false;
    const needed = kind === 'cha' ? 2 : 1;
    return Boolean(findSameRank(players[index].hand, rank, needed));
  });
}

function names(playerCount: 3 | 4): string[] {
  return playerCount === 3 ? ['你', 'AI 左', 'AI 右'] : ['你', 'AI 左', 'AI 上', 'AI 右'];
}

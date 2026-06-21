import { Card } from '../core/cards';
import { Combo } from '../core/rules';
import { TableEffect } from '../core/effects';

export type GameKey = '414' | 'doudizhu' | 'runfast' | 'guandan';
export type GamePhase = 'idle' | 'dealing' | 'bidding' | 'playing' | 'finished';
export type ActionKey = 'deal' | 'play' | 'pass' | 'hint' | 'clear' | 'cha' | 'gou' | 'bid0' | 'bid1' | 'bid2' | 'bid3';

export interface PlayerState {
  id: number;
  name: string;
  isHuman: boolean;
  role?: string;
  team?: string;
  hand: Card[];
  finished?: boolean;
  status?: string;
}

export interface TableRecord {
  id: number;
  playerIndex: number;
  cards: Card[];
  combo?: Combo;
  label: string;
  passed?: boolean;
  system?: 'leadStart' | 'relead' | 'deadCha' | 'gameOver';
}

export interface ScoreLine {
  playerIndex: number;
  playerName: string;
  remainingCards: number;
  multiplier: number;
  penalty: number;
  notes: string[];
}

export interface TableView {
  title: string;
  subtitle: string;
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerIndex: number;
  tableRecords: Array<TableRecord | undefined>;
  visibleRecord?: TableRecord;
  latestRecord?: TableRecord;
  message: string;
  promptText?: string;
  scores?: string[];
  scoreLines?: ScoreLine[];
  effect?: TableEffect;
  settingsSummary?: string;
}

export interface GameModule<S> {
  key: GameKey;
  title: string;
  create(): S;
  view(state: S): TableView;
  deal(state: S): S;
  dealStep?(state: S): S;
  legalActions(state: S, selected: Card[]): ActionKey[];
  apply(state: S, action: ActionKey, selected: Card[]): S;
  hint(state: S): Card[];
  bestHint?(state: S): Card[];
  aiStep(state: S): S;
  isHumanTurn(state: S): boolean;
  setOption?(state: S, option: string, value: string | number): S;
}

export function nextActive(players: PlayerState[], start: number): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (start + offset) % players.length;
    if (!players[index].finished) return index;
  }
  return start;
}

export function tableRecordId(): number {
  return Date.now() + Math.floor(Math.random() * 100000);
}

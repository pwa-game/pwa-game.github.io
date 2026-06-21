import { douDizhuModule } from './doudizhu';
import { fourFourteenModule } from './fourFourteen';
import { guanDanModule } from './guanDan';
import { runFastModule } from './runFast';
import { GameKey, GameModule } from './types';

export const gameModules: Record<GameKey, GameModule<unknown>> = {
  '414': fourFourteenModule as GameModule<unknown>,
  doudizhu: douDizhuModule as GameModule<unknown>,
  runfast: runFastModule as GameModule<unknown>,
  guandan: guanDanModule as GameModule<unknown>
};

export const gameOrder: GameKey[] = ['414', 'doudizhu', 'runfast', 'guandan'];

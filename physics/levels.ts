export type LevelType = 'baskets' | 'rings' | 'starball' | 'deepsea';

export interface TargetConfig {
  id: string;
  /** Horizontal offset from the tank's center — NOT an absolute x — so layouts stay centered on any screen width. */
  dx: number;
  /** Rim (opening) height of the cup — see createCup in physics/engine.ts for the bowl shape below it. */
  y: number;
}

export interface PegConfig {
  id: string;
  dx: number;
  y: number;
}

export interface PhaseConfig {
  id: number;
  name: string;
}

/** Each Phase owns one new mechanic, introduced/tightened/mastered across its 3 Levels. */
export const PHASES: PhaseConfig[] = [
  { id: 1, name: 'Foundations' },
  { id: 2, name: 'The Clock' },
];

export interface LevelConfig {
  id: string;
  /** Which Phase (mechanic umbrella) this level belongs to — see PHASES. */
  phase: number;
  /** Position within its Phase (1-3): gentle intro -> tightened -> mastery test. */
  levelInPhase: number;
  type: LevelType;
  name: string;
  targets: TargetConfig[];
  pegs: PegConfig[];
  ballCount: number;
  ballColors: string[];
  /**
   * Phase 2's "ball lifecycle" mechanic: when set, a floating ball (not currently resting in a
   * cup) ages out and sinks after this many ms. Undefined = balls live forever, i.e. every
   * Phase 1 level, unchanged from the original design.
   */
  ballLifespanMs?: number;
}

const BALL_PALETTE = [
  '#FF3B7F',
  '#8A5CFF',
  '#FFD23B',
  '#3BD6FF',
  '#3BFFA0',
  '#FF7A3B',
  '#FF3B7F',
  '#8A5CFF',
  '#FFD23B',
];

// Shared 3x3 grid coordinates (matching the real Waterfuls toy), reused across levels so each
// level is just a subset of rows — top row alone, top+middle, then the full grid.
const TOP_ROW: TargetConfig[] = [
  { id: 't1', dx: -110, y: 140 },
  { id: 't2', dx: 0, y: 130 },
  { id: 't3', dx: 110, y: 140 },
];
const MIDDLE_ROW: TargetConfig[] = [
  { id: 't4', dx: -110, y: 230 },
  { id: 't5', dx: 0, y: 220 },
  { id: 't6', dx: 110, y: 230 },
];
const BOTTOM_ROW: TargetConfig[] = [
  { id: 't7', dx: -110, y: 320 },
  { id: 't8', dx: 0, y: 310 },
  { id: 't9', dx: 110, y: 320 },
];
const PEGS_ROW_1: PegConfig[] = [
  { id: 'p1', dx: -55, y: 185 },
  { id: 'p2', dx: 55, y: 185 },
];
const PEGS_ROW_2: PegConfig[] = [
  { id: 'p3', dx: -55, y: 275 },
  { id: 'p4', dx: 55, y: 275 },
];

/** Data-driven level list: a 3 -> 6 -> 9 cup progression, all sharing the same grid layout. */
export const LEVELS: LevelConfig[] = [
  {
    id: 'level-1',
    phase: 1,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Three Cups',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-2',
    phase: 1,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Six Cups',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-3',
    phase: 1,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Nine Cups',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-4',
    phase: 2,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Countdown Ring',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    ballLifespanMs: 7000,
  },
];

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

export interface LevelConfig {
  id: string;
  phase: number;
  type: LevelType;
  name: string;
  targets: TargetConfig[];
  pegs: PegConfig[];
  ballCount: number;
  ballColors: string[];
}

const NINE_CUP_BALL_PALETTE = [
  '#FF3B7F',
  '#8A5CFF',
  '#FFD23B',
  '#3BD6FF',
  '#3BFFA0',
  '#FF7A3B',
  '#FF3B7F',
  '#8A5CFF',
  '#FFD23B',
  '#3BD6FF',
  '#3BFFA0',
  '#FF7A3B',
];

/**
 * Data-driven level list. Phase 1 (baskets) is fully playable; phase 2 (rings)
 * reuses the same ball/target-proximity win check as a starting point — swap in
 * peg-specific collision geometry when building out ring-toss properly.
 */
export const LEVELS: LevelConfig[] = [
  {
    id: 'phase1-1',
    phase: 1,
    type: 'baskets',
    name: 'Nine Cups',
    // 3x3 grid matching the real Waterfuls toy: 9 cups, 12 balls (more balls than slots), with
    // small pegs nestled in the gaps between cups.
    targets: [
      { id: 't1', dx: -110, y: 140 },
      { id: 't2', dx: 0, y: 130 },
      { id: 't3', dx: 110, y: 140 },
      { id: 't4', dx: -110, y: 230 },
      { id: 't5', dx: 0, y: 220 },
      { id: 't6', dx: 110, y: 230 },
      { id: 't7', dx: -110, y: 320 },
      { id: 't8', dx: 0, y: 310 },
      { id: 't9', dx: 110, y: 320 },
    ],
    pegs: [
      { id: 'p1', dx: -55, y: 185 },
      { id: 'p2', dx: 55, y: 185 },
      { id: 'p3', dx: -55, y: 275 },
      { id: 'p4', dx: 55, y: 275 },
    ],
    ballCount: 12,
    ballColors: NINE_CUP_BALL_PALETTE,
  },
  {
    id: 'phase1-2',
    phase: 1,
    type: 'baskets',
    name: 'Four Baskets',
    targets: [
      { id: 't1', dx: -150, y: 190 },
      { id: 't2', dx: -50, y: 160 },
      { id: 't3', dx: 50, y: 160 },
      { id: 't4', dx: 150, y: 190 },
    ],
    pegs: [],
    ballCount: 4,
    ballColors: ['#FF3B7F', '#3BD6FF', '#FFD23B', '#8A5CFF'],
  },
  {
    id: 'phase2-1',
    phase: 2,
    type: 'rings',
    name: 'Ring Toss',
    targets: [
      { id: 'peg1', dx: -60, y: 170 },
      { id: 'peg2', dx: 60, y: 170 },
    ],
    pegs: [],
    ballCount: 2,
    ballColors: ['#FF7A3B', '#3BFFA0'],
  },
];

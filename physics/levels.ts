export type LevelType = 'baskets' | 'rings' | 'starball' | 'deepsea';

export interface TargetConfig {
  id: string;
  /** Horizontal offset from the tank's center — NOT an absolute x — so layouts stay centered on any screen width. */
  dx: number;
  /** Rim (opening) height of the cup — see createCup in physics/engine.ts for the bowl shape below it. */
  y: number;
}

export interface LevelConfig {
  id: string;
  phase: number;
  type: LevelType;
  name: string;
  targets: TargetConfig[];
  ballCount: number;
  ballColors: string[];
}

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
    name: 'Semicircle Baskets',
    targets: [
      { id: 't1', dx: -120, y: 170 },
      { id: 't2', dx: 0, y: 150 },
      { id: 't3', dx: 120, y: 170 },
    ],
    ballCount: 3,
    ballColors: ['#FF3B7F', '#3BD6FF', '#FFD23B'],
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
    ballCount: 2,
    ballColors: ['#FF7A3B', '#3BFFA0'],
  },
];

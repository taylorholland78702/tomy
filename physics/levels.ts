export type LevelType = 'baskets' | 'rings' | 'starball' | 'deepsea';

export interface TargetConfig {
  id: string;
  x: number;
  y: number;
  radius: number;
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
      { id: 't1', x: 70, y: 170, radius: 30 },
      { id: 't2', x: 190, y: 150, radius: 30 },
      { id: 't3', x: 310, y: 170, radius: 30 },
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
      { id: 't1', x: 50, y: 190, radius: 26 },
      { id: 't2', x: 150, y: 160, radius: 26 },
      { id: 't3', x: 250, y: 160, radius: 26 },
      { id: 't4', x: 340, y: 190, radius: 26 },
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
      { id: 'peg1', x: 110, y: 170, radius: 16 },
      { id: 'peg2', x: 230, y: 170, radius: 16 },
    ],
    ballCount: 2,
    ballColors: ['#FF7A3B', '#3BFFA0'],
  },
];

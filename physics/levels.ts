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
  { id: 3, name: 'Moving Target' },
  { id: 4, name: 'Chain Reaction' },
  { id: 5, name: 'Undertow' },
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
  /** Enables the countdown tick sound (see utils/audio.ts), speeding up as a ball nears expiry. */
  tickAudio?: boolean;
  /** Enables age-based shrinking (see FIZZY_MIN_SCALE in GameCanvas.tsx) — late hits get harder. */
  ballFizzy?: boolean;
  /**
   * Phase 3's "moving target" mechanic: 'drift' slowly sways the Air Jet button left-right,
   * 'jump' teleports it to a new spot after every release, 'twin' keeps 'jump' behavior on the
   * primary button and adds a second temporary button on the opposite side. Undefined = button
   * stays centered, i.e. every Phase 1/2 level, unchanged from the original design.
   */
  buttonMotion?: 'drift' | 'jump' | 'twin';
  /**
   * Phase 4's "chain reaction" mechanic: groups of target ids (see TOP_ROW etc.) that count as a
   * same-row match when every cup in the group holds a settled ball AND all those balls share the
   * same color. Only meaningful when chainMatchBonus is also set.
   */
  matchRows?: string[][];
  /** Landing all of a matchRows group with matching colors spawns a bonus ball + chime once per group. */
  chainMatchBonus?: boolean;
  /** Enables the combo meter: quick consecutive landings build a streak that decays if you pause. */
  comboMeter?: boolean;
  /** Enables the temporary bonus cup that cycles between random unfilled targets. */
  rainbowCup?: boolean;
  /** Phase 5's hazard mechanic: a gentle, continuously-oscillating sideways force on every ball. */
  sideCurrent?: boolean;
  /**
   * Phase 5's hazard mechanic: this many of the level's balls are "sinkers" — dull-colored balls
   * that can physically occupy a cup but never count toward filling it (they get a 'sinker-'
   * label instead of 'ball-', which every win-condition/settle check already filters on).
   */
  sinkerCount?: number;
  /** Phase 5's hazard mechanic: the ramp gradually rises toward the fixed cups over the level. */
  risingWater?: boolean;
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
    ballLifespanMs: 30000,
  },
  {
    id: 'level-5',
    phase: 2,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Countdown Six',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    ballLifespanMs: 30000,
  },
  {
    id: 'level-6',
    phase: 2,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Countdown Nine',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    ballLifespanMs: 30000,
  },
  {
    id: 'level-7',
    phase: 3,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Drifting Aim',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    buttonMotion: 'drift',
  },
  {
    id: 'level-8',
    phase: 3,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Jumping Aim',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    buttonMotion: 'jump',
  },
  {
    id: 'level-9',
    phase: 3,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Double Trouble',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    buttonMotion: 'twin',
  },
  {
    id: 'level-10',
    phase: 4,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Chain Bonus',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    // All three balls share a color so the very first completion always fires the chain-match
    // bonus — a guaranteed, unmistakable intro to the mechanic before later levels make it merely
    // possible rather than automatic.
    ballColors: [BALL_PALETTE[0], BALL_PALETTE[0], BALL_PALETTE[0]],
    matchRows: [['t1', 't2', 't3']],
    chainMatchBonus: true,
  },
  {
    id: 'level-11',
    phase: 4,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Combo Streak',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    // One color repeated 3x keeps a chain match achievable (not guaranteed) alongside the new
    // combo mechanic, rather than the six fully-distinct colors every other 6-ball level uses.
    ballColors: [BALL_PALETTE[0], BALL_PALETTE[0], BALL_PALETTE[0], BALL_PALETTE[1], BALL_PALETTE[2], BALL_PALETTE[3]],
    matchRows: [
      ['t1', 't2', 't3'],
      ['t4', 't5', 't6'],
    ],
    chainMatchBonus: true,
    comboMeter: true,
  },
  {
    id: 'level-12',
    phase: 4,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Rainbow Rush',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    matchRows: [
      ['t1', 't2', 't3'],
      ['t4', 't5', 't6'],
      ['t7', 't8', 't9'],
    ],
    chainMatchBonus: true,
    comboMeter: true,
    rainbowCup: true,
  },
  {
    id: 'level-13',
    phase: 5,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Side Current',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    sideCurrent: true,
  },
  {
    id: 'level-14',
    phase: 5,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Sinker Ball',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    // 6 cups + 1 sinker (which never counts toward filling a cup) needs 7 balls total, not 6 —
    // otherwise there aren't enough real balls to ever fill every cup and the level is unwinnable.
    ballCount: 7,
    ballColors: BALL_PALETTE,
    sinkerCount: 1,
  },
  {
    id: 'level-15',
    phase: 5,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Full Undertow',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    // 9 cups + 1 sinker (which never counts toward filling a cup) needs 10 balls total, not 9 —
    // otherwise there aren't enough real balls to ever fill every cup and the level is unwinnable.
    // BALL_PALETTE only has 9 entries, so append one more repeated color for the 10th ball.
    ballCount: 10,
    ballColors: [...BALL_PALETTE, BALL_PALETTE[0]],
    // Combines both earlier Phase 5 mechanics and adds the rising floor, per the phase's own
    // design text ("Level 3 combines both and adds...") — unlike Phases 2-4, this phase is
    // cumulative by design.
    sideCurrent: true,
    sinkerCount: 1,
    risingWater: true,
  },
];

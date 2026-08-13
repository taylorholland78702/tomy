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

/**
 * Reef's rotating-gear obstacle: a regular polygon (see createGear in physics/engine.ts), spun
 * continuously via Matter.Body.rotate. Non-circular on purpose - a rotating circle is physically
 * identical to a static one, so the polygon shape is what actually makes bounces vary as it spins.
 */
export interface GearConfig {
  id: string;
  dx: number;
  y: number;
  radius: number;
  sides: number;
  /** Radians per ms - sign sets spin direction. */
  angularSpeed: number;
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
  { id: 6, name: 'Bonus Tokens' },
  { id: 7, name: 'Split Stream' },
  { id: 8, name: 'Full Tilt' },
  { id: 9, name: 'Waterfuls Unleashed' },
];

export interface WaterPalette {
  /** Tank.tsx's water-gradient stop colors, offsets 0 / 0.4 / 1 respectively. */
  top: string;
  mid: string;
  bottom: string;
}

export interface ZoneConfig {
  id: string;
  name: string;
  /** Which Phases (see PHASES) this ocean zone spans. */
  phaseIds: number[];
  palette: WaterPalette;
}

/** Today's exact Tank.tsx water-gradient colors — every zone not yet given its own look uses this, so it renders pixel-identical to before this zone system existed. */
const DEFAULT_PALETTE: WaterPalette = { top: '#8FF0FF', mid: '#39C4F0', bottom: '#0B5C8A' };

/**
 * The ocean-journey framing over the existing 9 Phases: two Phases per zone, grouped by where
 * they already fit thematically (Undertow's current/rising-water suits Open Ocean; the finale
 * suits Sunken Ship as a climax) rather than by renumbering any mechanic. Tide Pool (pale foam ->
 * bright turquoise -> shallow teal), Reef (warm coral -> vivid turquoise -> deeper reef teal), and
 * Open Ocean (dim steel blue -> deep navy -> near-black, sparse and dark per its "harder because
 * you can see less" brief) have their own palettes so far; every zone past Open Ocean is still
 * DEFAULT_PALETTE until its own turn.
 */
export const ZONES: ZoneConfig[] = [
  { id: 'tide-pool', name: 'Tide Pool', phaseIds: [1], palette: { top: '#EAFBF3', mid: '#7FE8D4', bottom: '#2FB8A0' } },
  { id: 'reef', name: 'Reef', phaseIds: [2, 3], palette: { top: '#FFDFC4', mid: '#3FCBC0', bottom: '#0C7A88' } },
  { id: 'open-ocean', name: 'Open Ocean', phaseIds: [4, 5], palette: { top: '#3A5A78', mid: '#1C3A56', bottom: '#081826' } },
  { id: 'trench', name: 'Trench', phaseIds: [6, 7], palette: DEFAULT_PALETTE },
  { id: 'sunken-ship', name: 'Sunken Ship', phaseIds: [8, 9], palette: DEFAULT_PALETTE },
];

export function zoneForPhase(phaseId: number): ZoneConfig {
  return ZONES.find((z) => z.phaseIds.includes(phaseId)) ?? ZONES[0];
}

export interface LevelConfig {
  id: string;
  /** Which Phase (mechanic umbrella) this level belongs to — see PHASES. */
  phase: number;
  /** Position within its Phase (1-3): gentle intro -> tightened -> mastery test. */
  levelInPhase: number;
  type: LevelType;
  name: string;
  /** One-line, curt description of what makes this level hard — shown under the level name. */
  challenge: string;
  targets: TargetConfig[];
  pegs: PegConfig[];
  /** Reef's rotating-gear obstacle (see GearConfig). Undefined = no gears, i.e. every level so far. */
  gears?: GearConfig[];
  ballCount: number;
  ballColors: string[];
  /**
   * Phase 2's "beat the clock" mechanic: when set, the whole level races a single shared
   * countdown (shown in the HUD, ticking faster as it nears zero — see utils/audio.ts's
   * playCountdownTick). Reaching zero before every target is filled restarts the level, same as
   * tapping the Restart button. Undefined = no clock, i.e. every level outside Phase 2 and the
   * finale, unchanged from the original design.
   */
  levelTimerMs?: number;
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
  /**
   * Phase 6's power-up mechanic: this many balls are "golden" — same as a normal ball (counts
   * toward filling its own cup), but landing one auto-fills a random other empty cup once per
   * level instance.
   */
  goldenCount?: number;
  /**
   * Phase 6's power-up mechanic: this many balls are "magnets" — same as a normal ball, but while
   * still floating (not yet settled) it pulls other floating balls toward it.
   */
  magnetCount?: number;
  /** Phase 6's power-up mechanic: holding the button past a threshold before releasing adds a one-time power burst on release. */
  chargeableJet?: boolean;
  /**
   * Phase 7's "split stream" mechanic: one evolving control scheme (like buttonMotion), not
   * independent flags — 'basic' splits the single button into two, each hard-restricted to only
   * launching balls on its own half; 'centerBurst' keeps that and adds a strong center burst when
   * both buttons are held together; 'swipe' keeps both and adds drag-to-angle on each button.
   */
  splitButtons?: 'basic' | 'centerBurst' | 'swipe';
  /**
   * Phase 8's "full tilt" mechanic: one evolving control scheme (like buttonMotion/splitButtons) —
   * 'sway' gently drifts every cup side-to-side, out of phase with each other; 'tilt' keeps cups
   * still but periodically rotates each one shut on its own cycle (independent per cup), so a ball
   * can't land while it's closed past a threshold tilt and an already-settled ball gets physically
   * displaced as the wall rotates; 'full' runs both sway and tilt simultaneously. Undefined = cups
   * stay perfectly still, i.e. every Phase 1-7 level, unchanged from the original design.
   */
  cupMotion?: 'sway' | 'tilt' | 'full';
  /**
   * Phase 9 Level 26's "raise the pace" mechanic: scales every existing time-based mechanic this
   * level also enables (sideCurrent's oscillation period, cupMotion's tilt cycle) uniformly
   * faster. A plain multiplier rather than duplicate period constants, so it composes with
   * whichever Phase 5/8 flags this level already turns on without touching the shared module-level
   * constants those flags use for every other level. Undefined = 1 (no change), i.e. every
   * Phase 1-8 level, unchanged from the original design.
   */
  paceMultiplier?: number;
  /**
   * Phase 9 Level 27's finale mechanic: gates the combo-driven audio/visual flourishes (rising
   * landing-note pitch/volume, tank hue tint, threshold screen-shake). Kept separate from
   * comboMeter itself, since comboMeter's existing semantics are purely about tracking the combo
   * counter/window — every earlier comboMeter level (11, 12) must keep rendering only the plain
   * "Combo x N" pill with no side effects. Undefined = no finale effects, i.e. every other level.
   */
  finaleEffects?: boolean;
  /**
   * Hard cup-lock retention: once a ball settles into a cup on a level with this set, it becomes
   * permanently pinned there (position + velocity overridden every frame — see lockBallAtAnchor in
   * physics/engine.ts) instead of being subject to applyCupRetention's breakable spring. The only
   * way to free locked balls is the player tipping the phone's top edge away from them (a strongly
   * negative engine.gravity.y — see FORWARD_TILT_EJECT_GRAVITY_Y in GameCanvas.tsx), which releases
   * every currently-locked ball in the level back to normal physics at once.
   *
   * Only set on Phases 1-4 and 6-7 (ids 1-12, 16-21) — phases whose hazard doesn't depend on being
   * able to dislodge an already-settled ball. Undefined (Phases 5, 8, 9 — ids 13-15, 22-24, 25-27,
   * unchanged) keeps the original applyCupRetention spring-only behavior, so side current and cup
   * sway/tilt can still walk a settled ball back out exactly as before.
   */
  stickyRetention?: boolean;
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
    // See LevelConfig.stickyRetention — Phases 1-4/6-7 lock settled balls permanently.
    stickyRetention: true,
    phase: 1,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Three Cups',
    challenge: 'Land each ball in its cup.',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-2',
    stickyRetention: true,
    phase: 1,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Six Cups',
    challenge: 'Six cups, one shot each.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-3',
    stickyRetention: true,
    phase: 1,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Nine Cups',
    challenge: 'Full board, no hints.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
  },
  {
    id: 'level-4',
    stickyRetention: true,
    phase: 2,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Countdown Clock',
    challenge: 'Fill every cup before time runs out.',
    targets: TOP_ROW,
    pegs: [],
    // Reef's debut obstacle: two rotating hexagons between the ramp and the cups. First-pass
    // placement/speed, not tuned against real playtest data — Level 4 had zero pegs before this,
    // so this is purely additive rather than replacing anything.
    gears: [
      { id: 'gear-1', dx: -70, y: 210, radius: 14, sides: 6, angularSpeed: Math.PI / 2000 },
      { id: 'gear-2', dx: 70, y: 210, radius: 14, sides: 6, angularSpeed: -Math.PI / 2000 },
    ],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    // Redesigned from a per-ball aging/sinking timer to one shared level clock, per explicit
    // request. 15s base + 5s/ball is a first-pass estimate (10s/cup here), not tuned against real
    // playtest data — likely needs adjustment once someone's actually played it.
    levelTimerMs: 30000,
  },
  {
    id: 'level-5',
    stickyRetention: true,
    phase: 2,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Countdown Six',
    challenge: 'Six balls, one shared clock.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    // Same two-gear count as level-4, moved outward (dx ±110) to clear PEGS_ROW_1 (dx ±55) and
    // sit in the gap above the new MIDDLE_ROW cups. First-pass placement/speed.
    gears: [
      { id: 'gear-1', dx: -110, y: 190, radius: 14, sides: 6, angularSpeed: Math.PI / 2000 },
      { id: 'gear-2', dx: 110, y: 190, radius: 14, sides: 6, angularSpeed: -Math.PI / 2000 },
    ],
    ballCount: 6,
    ballColors: BALL_PALETTE,
    // See level-4's comment — same 15s + 5s/ball formula (7.5s/cup here), tightened as ball count
    // rises.
    levelTimerMs: 45000,
  },
  {
    id: 'level-6',
    stickyRetention: true,
    phase: 2,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Countdown Nine',
    challenge: 'Every cup, one countdown.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    // Mastery checkpoint: level-5's pair plus a second pair in the gap below MIDDLE_ROW (clearing
    // PEGS_ROW_2 the same way), spun a little faster. First-pass placement/speed.
    gears: [
      { id: 'gear-1', dx: -110, y: 190, radius: 14, sides: 6, angularSpeed: Math.PI / 1800 },
      { id: 'gear-2', dx: 110, y: 190, radius: 14, sides: 6, angularSpeed: -Math.PI / 1800 },
      { id: 'gear-3', dx: -110, y: 280, radius: 14, sides: 6, angularSpeed: -Math.PI / 1800 },
      { id: 'gear-4', dx: 110, y: 280, radius: 14, sides: 6, angularSpeed: Math.PI / 1800 },
    ],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    // See level-4's comment — same formula (6.67s/cup here), the phase's mastery checkpoint.
    levelTimerMs: 60000,
  },
  {
    id: 'level-7',
    stickyRetention: true,
    phase: 3,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Drifting Aim',
    challenge: "The button won't sit still.",
    targets: TOP_ROW,
    pegs: [],
    // Same layout as level-4 (identical targets/pegs) — gears mirror it exactly.
    gears: [
      { id: 'gear-1', dx: -70, y: 210, radius: 14, sides: 6, angularSpeed: Math.PI / 2000 },
      { id: 'gear-2', dx: 70, y: 210, radius: 14, sides: 6, angularSpeed: -Math.PI / 2000 },
    ],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    buttonMotion: 'drift',
  },
  {
    id: 'level-8',
    stickyRetention: true,
    phase: 3,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Jumping Aim',
    challenge: 'It teleports after every shot.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    // Same layout as level-5 — gears mirror it exactly.
    gears: [
      { id: 'gear-1', dx: -110, y: 190, radius: 14, sides: 6, angularSpeed: Math.PI / 2000 },
      { id: 'gear-2', dx: 110, y: 190, radius: 14, sides: 6, angularSpeed: -Math.PI / 2000 },
    ],
    ballCount: 6,
    ballColors: BALL_PALETTE,
    buttonMotion: 'jump',
  },
  {
    id: 'level-9',
    stickyRetention: true,
    phase: 3,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Double Trouble',
    challenge: 'A second button appears — briefly.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    // Same layout as level-6 (mastery checkpoint) — gears mirror it exactly.
    gears: [
      { id: 'gear-1', dx: -110, y: 190, radius: 14, sides: 6, angularSpeed: Math.PI / 1800 },
      { id: 'gear-2', dx: 110, y: 190, radius: 14, sides: 6, angularSpeed: -Math.PI / 1800 },
      { id: 'gear-3', dx: -110, y: 280, radius: 14, sides: 6, angularSpeed: -Math.PI / 1800 },
      { id: 'gear-4', dx: 110, y: 280, radius: 14, sides: 6, angularSpeed: Math.PI / 1800 },
    ],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    buttonMotion: 'twin',
  },
  {
    id: 'level-10',
    stickyRetention: true,
    phase: 4,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Chain Bonus',
    challenge: "Match a row's colors for a bonus.",
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
    stickyRetention: true,
    phase: 4,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Combo Streak',
    challenge: 'Land fast to keep the streak alive.',
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
    stickyRetention: true,
    phase: 4,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Rainbow Rush',
    challenge: 'Catch the bonus cup before it moves on.',
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
    challenge: 'A sideways pull keeps shifting.',
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
    challenge: 'One ball never counts.',
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
    challenge: 'Current, sinker, and a rising floor.',
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
  {
    id: 'level-16',
    stickyRetention: true,
    phase: 6,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Golden Ball',
    challenge: 'One ball fills a second cup for free.',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    goldenCount: 1,
  },
  {
    id: 'level-17',
    stickyRetention: true,
    phase: 6,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Magnet Ball',
    challenge: 'It pulls nearby balls in mid-air.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    magnetCount: 1,
  },
  {
    id: 'level-18',
    stickyRetention: true,
    phase: 6,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Charged Bubble',
    challenge: 'Hold the button to charge a power shot.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    chargeableJet: true,
  },
  {
    id: 'level-19',
    stickyRetention: true,
    phase: 7,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Split Stream',
    challenge: 'Two buttons, each covers half the board.',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    splitButtons: 'basic',
  },
  {
    id: 'level-20',
    stickyRetention: true,
    phase: 7,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Center Clear',
    challenge: 'Press both together to reach the middle.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    splitButtons: 'centerBurst',
  },
  {
    id: 'level-21',
    stickyRetention: true,
    phase: 7,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Angled Stream',
    challenge: 'Drag while holding to angle your shot.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    splitButtons: 'swipe',
  },
  {
    id: 'level-22',
    phase: 8,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Gentle Sway',
    challenge: "The cups won't stay put.",
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    cupMotion: 'sway',
  },
  {
    id: 'level-23',
    phase: 8,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Closing Time',
    challenge: 'Cups periodically tilt shut.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    cupMotion: 'tilt',
  },
  {
    id: 'level-24',
    phase: 8,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Full Tilt',
    challenge: 'Swaying, tilting cups, current, and a sinker.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    // 9 cups + 1 sinker (which never counts toward filling a cup) needs 10 balls total, not 9 —
    // otherwise there aren't enough real balls to ever fill every cup and the level is unwinnable.
    // BALL_PALETTE only has 9 entries, so append one more repeated color for the 10th ball.
    ballCount: 10,
    ballColors: [...BALL_PALETTE, BALL_PALETTE[0]],
    // Combines both of Phase 8's own mechanics with Phase 5's current + sinker hazards, per the
    // phase's own "everything at once" mastery-checkpoint design (mirrors level-15's Full Undertow).
    cupMotion: 'full',
    sideCurrent: true,
    sinkerCount: 1,
  },
  {
    id: 'level-25',
    phase: 9,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Highlight Reel',
    challenge: 'Drifting aim, current, and combos — all at once.',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    // A short "greatest hits" remix: Phase 3's drifting button (aim challenge) + Phase 5's side
    // current (in-flight hazard) + Phase 4's combo meter (rewards fast, confident play against
    // both) — three earlier mechanics stacked on the smallest board, reading as a preview of
    // everything still to come rather than a new mechanic of its own. Pure data reuse.
    buttonMotion: 'drift',
    sideCurrent: true,
    comboMeter: true,
  },
  {
    id: 'level-26',
    phase: 9,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Full Speed',
    challenge: 'Everything from before, sped way up.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    // Same remix ingredients as Level 25 plus Phase 8's tilt, all sped up via paceMultiplier:
    // faster current oscillation, quicker cup tilt cycles, and now a tighter shared clock —
    // "everything from Level 25, but urgent." levelTimerMs is level-4's 15s + 5s/ball formula
    // (45s for 6 balls) divided by paceMultiplier, same as every other timed mechanic this level
    // scales — first-pass estimate, not tuned against real playtest data.
    buttonMotion: 'drift',
    sideCurrent: true,
    cupMotion: 'tilt',
    comboMeter: true,
    levelTimerMs: 28000,
    paceMultiplier: 1.6,
  },
  {
    id: 'level-27',
    phase: 9,
    levelInPhase: 3,
    type: 'baskets',
    name: 'Waterfuls Unleashed',
    challenge: 'Every mechanic, full pace, finale flourishes.',
    targets: [...TOP_ROW, ...MIDDLE_ROW, ...BOTTOM_ROW],
    pegs: [...PEGS_ROW_1, ...PEGS_ROW_2],
    ballCount: 9,
    ballColors: BALL_PALETTE,
    // The set-piece finale: full remix + full pace + the lightweight combo-reactive flourishes
    // (rising note, tank tint, threshold screen-shake — see GameCanvas.tsx). levelTimerMs: see
    // Level 26's comment - same formula (60s for 9 balls) divided by paceMultiplier.
    buttonMotion: 'drift',
    sideCurrent: true,
    cupMotion: 'full',
    comboMeter: true,
    finaleEffects: true,
    levelTimerMs: 38000,
    paceMultiplier: 1.6,
  },
];

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

/**
 * A periodic gate: a wall segment that toggles between blocking and passable on a repeating
 * cycle (see createGate/setGateOpen in physics/engine.ts). Forces the player to time a shot
 * through the open window rather than just aim. Currently unused by any level (its debut level
 * was part of the Trench zone, removed along with Phases 5-7).
 */
export interface GateConfig {
  id: string;
  dx: number;
  y: number;
  width: number;
  height: number;
  /** Ms open, then ms closed, repeating. */
  openMs: number;
  closedMs: number;
  /** Offset into the cycle at level start, ms - lets multiple gates run out of phase. */
  phaseOffsetMs?: number;
}

/**
 * A periodic geyser: an uncontrollable air jet (reuses the same applyAirJet the player's own jet
 * uses, see physics/engine.ts) that fires on its own schedule instead of on button-press.
 * Currently unused by any level (its debut level was part of the Full Tilt phase, removed).
 */
export interface GeyserConfig {
  id: string;
  dx: number;
  y: number;
  /** Ms firing, then ms idle, repeating. */
  fireMs: number;
  idleMs: number;
  phaseOffsetMs?: number;
  strength: number;
}

/**
 * A crumbling peg: a normal-looking peg (see createCrumblingPeg in physics/engine.ts) that
 * breaks and disappears after hitsToBreak ball hits, detected via a matter-js collisionStart
 * handler. Currently unused by any level (its debut level was part of the Trench zone, removed
 * along with Phases 5-7).
 */
export interface CrumblingPegConfig {
  id: string;
  dx: number;
  y: number;
  radius: number;
  /** Ball hits before it breaks and disappears. */
  hitsToBreak: number;
}

/**
 * A portal pair: entering either endpoint's radius teleports the ball to the other
 * (bidirectional). No physics body - detected via a plain per-frame distance check, not collision
 * events, since a discrete "am I near this point" test doesn't need the real thing. Currently
 * unused by any level (its debut level was part of the Full Tilt phase, removed).
 */
export interface PortalConfig {
  id: string;
  aDx: number;
  aY: number;
  bDx: number;
  bY: number;
  radius: number;
}

export interface PhaseConfig {
  id: number;
  name: string;
}

/** Each Phase owns one new mechanic, introduced/tightened/mastered across its 3 Levels. */
export const PHASES: PhaseConfig[] = [
  { id: 1, name: 'Foundations' },
  { id: 2, name: 'The Clock' },
  { id: 3, name: 'Waterfuls Unleashed' },
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
 * The ocean-journey framing over the game's 3 Phases: Tide Pool, Reef, and Sunken Ship as the
 * finale climax, each getting its own Phase. Open Ocean, Trench, and Full Tilt's own slice of
 * Sunken Ship (previously Phases 4-8 of a 9-Phase game) were removed along with those phases.
 * Tide Pool (pale foam -> bright turquoise -> shallow teal), Reef (warm coral -> vivid turquoise
 * -> deeper reef teal), and Sunken Ship (murky wreck green, a hint of decay rather than pure
 * depth) each keep their own water palette. DEFAULT_PALETTE now only backs levels that predate
 * the zone system in tests/tooling, not any live zone.
 */
export const ZONES: ZoneConfig[] = [
  { id: 'tide-pool', name: 'Tide Pool', phaseIds: [1], palette: { top: '#EAFBF3', mid: '#7FE8D4', bottom: '#2FB8A0' } },
  { id: 'reef', name: 'Reef', phaseIds: [2], palette: { top: '#FFDFC4', mid: '#3FCBC0', bottom: '#0C7A88' } },
  { id: 'sunken-ship', name: 'Sunken Ship', phaseIds: [3], palette: { top: '#2A3B35', mid: '#16241F', bottom: '#0A120F' } },
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
  /** Periodic gate obstacle (see GateConfig). Currently unused by any level. */
  gates?: GateConfig[];
  /** Periodic geyser obstacle (see GeyserConfig). Currently unused by any level. */
  geysers?: GeyserConfig[];
  /** Crumbling peg obstacle (see CrumblingPegConfig). Currently unused by any level. */
  crumblingPegs?: CrumblingPegConfig[];
  /** Portal pair obstacle (see PortalConfig). Currently unused by any level. */
  portals?: PortalConfig[];
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
   * The "moving target" mechanic (currently unused by any level): 'drift' slowly sways the Air
   * Jet button left-right, 'jump' teleports it to a new spot after every release, 'twin' keeps
   * 'jump' behavior on the primary button and adds a second temporary button on the opposite
   * side. Undefined = button stays centered, i.e. every level.
   */
  buttonMotion?: 'drift' | 'jump' | 'twin';
  /**
   * Groups of target ids (see TOP_ROW etc.) that count as a same-row match when every cup in the
   * group holds a settled ball AND all those balls share the same color. Only meaningful when
   * chainMatchBonus is also set. Currently unused by any level.
   */
  matchRows?: string[][];
  /** Landing all of a matchRows group with matching colors spawns a bonus ball + chime once per group. Currently unused by any level. */
  chainMatchBonus?: boolean;
  /** Enables the combo meter: quick consecutive landings build a streak that decays if you pause. Used by the finale Phase. */
  comboMeter?: boolean;
  /** Enables the temporary bonus cup that cycles between random unfilled targets. Currently unused by any level. */
  rainbowCup?: boolean;
  /** Hazard mechanic: a gentle, continuously-oscillating sideways force on every ball. Used throughout the finale Phase. */
  sideCurrent?: boolean;
  /**
   * Hazard mechanic: this many of the level's balls are "sinkers" — dull-colored balls that can
   * physically occupy a cup but never count toward filling it (they get a 'sinker-' label instead
   * of 'ball-', which every win-condition/settle check already filters on). Currently unused by
   * any level.
   */
  sinkerCount?: number;
  /** Hazard mechanic: the ramp gradually rises toward the fixed cups over the level. Currently unused by any level. */
  risingWater?: boolean;
  /**
   * Power-up mechanic: this many balls are "golden" — same as a normal ball (counts toward
   * filling its own cup), but landing one auto-fills a random other empty cup once per level
   * instance. Currently unused by any level.
   */
  goldenCount?: number;
  /**
   * Power-up mechanic: this many balls are "magnets" — same as a normal ball, but while still
   * floating (not yet settled) it pulls other floating balls toward it. Currently unused by any
   * level.
   */
  magnetCount?: number;
  /** Power-up mechanic: holding the button past a threshold before releasing adds a one-time power burst on release. Currently unused by any level. */
  chargeableJet?: boolean;
  /**
   * The "split stream" mechanic: one evolving control scheme (like buttonMotion), not independent
   * flags — 'basic' splits the single button into two, each hard-restricted to only launching
   * balls on its own half; 'centerBurst' keeps that and adds a strong center burst when both
   * buttons are held together; 'swipe' keeps both and adds drag-to-angle on each button.
   * Currently unused by any level.
   */
  splitButtons?: 'basic' | 'centerBurst' | 'swipe';
  /**
   * The "full tilt" mechanic (like buttonMotion/splitButtons, an evolving control scheme, not
   * independent flags) — 'sway' gently drifts every cup side-to-side, out of phase with each
   * other; 'tilt' keeps cups still but periodically rotates each one shut on its own cycle
   * (independent per cup), so a ball can't land while it's closed past a threshold tilt and an
   * already-settled ball gets physically displaced as the wall rotates; 'full' runs both sway and
   * tilt simultaneously. Currently only used by the finale Phase's later levels. Undefined = cups
   * stay perfectly still, i.e. every other level.
   */
  cupMotion?: 'sway' | 'tilt' | 'full';
  /**
   * Phase 3 Level 8's "raise the pace" mechanic: scales every existing time-based mechanic this
   * level also enables (sideCurrent's oscillation period, cupMotion's tilt cycle) uniformly
   * faster. A plain multiplier rather than duplicate period constants, so it composes with
   * whichever flags this level already turns on without touching the shared module-level
   * constants those flags use for every other level. Undefined = 1 (no change), i.e. every level
   * outside Levels 8-9.
   */
  paceMultiplier?: number;
  /**
   * Phase 3 Level 9's finale mechanic: gates the combo-driven audio/visual flourishes (rising
   * landing-note pitch/volume, tank hue tint, threshold screen-shake). Kept separate from
   * comboMeter itself, since comboMeter's existing semantics are purely about tracking the combo
   * counter/window — every earlier comboMeter level (7, 8) must keep rendering only the plain
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
   * Only set on Phases 1-2 (ids 1-6) — phases whose hazard doesn't depend on being able to
   * dislodge an already-settled ball. Undefined (Phase 3 — ids 7-9) keeps the original
   * applyCupRetention spring-only behavior, so side current and cup tilt can still walk a
   * settled ball back out exactly as before.
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
    // See LevelConfig.stickyRetention — Phases 1-2 lock settled balls permanently.
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
    phase: 3,
    levelInPhase: 1,
    type: 'baskets',
    name: 'Highlight Reel',
    challenge: 'Current and combos — all at once.',
    targets: TOP_ROW,
    pegs: [],
    ballCount: 3,
    ballColors: BALL_PALETTE,
    // Opens the finale with everything it's about to demand at once: a sideways current (an
    // in-flight hazard) and the combo meter (rewards fast, confident play against it) — two
    // hazards stacked on the smallest board.
    sideCurrent: true,
    comboMeter: true,
  },
  {
    id: 'level-8',
    phase: 3,
    levelInPhase: 2,
    type: 'baskets',
    name: 'Full Speed',
    challenge: 'Everything from before, sped way up.',
    targets: [...TOP_ROW, ...MIDDLE_ROW],
    pegs: PEGS_ROW_1,
    ballCount: 6,
    ballColors: BALL_PALETTE,
    // Same ingredients as Level 7 plus cup tilt, all sped up via paceMultiplier: faster current
    // oscillation, quicker cup tilt cycles, and now a tighter shared clock — "everything from
    // Level 7, but urgent." levelTimerMs is Level 4's 15s + 5s/ball formula (45s for 6 balls)
    // divided by paceMultiplier, same as every other timed mechanic this level scales —
    // first-pass estimate, not tuned against real playtest data.
    sideCurrent: true,
    cupMotion: 'tilt',
    comboMeter: true,
    levelTimerMs: 28000,
    paceMultiplier: 1.6,
  },
  {
    id: 'level-9',
    phase: 3,
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
    // Level 8's comment - same formula (60s for 9 balls) divided by paceMultiplier.
    sideCurrent: true,
    cupMotion: 'full',
    comboMeter: true,
    finaleEffects: true,
    levelTimerMs: 38000,
    paceMultiplier: 1.6,
  },
];

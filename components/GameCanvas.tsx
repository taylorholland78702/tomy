import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Dimensions, Pressable, Text, StyleSheet } from 'react-native';
import Matter from 'matter-js';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Tank } from './Tank';
import { AirJetButton } from './AirJetButton';
import {
  createPhysicsWorld,
  createVRamp,
  createPeg,
  createCup,
  translateCup,
  rotateCup,
  computeRampPoints,
  applyWaterPhysics,
  applyRampGuide,
  applyCupRetention,
  lockBallAtAnchor,
  applyCurrent,
  applyMagnetAttraction,
  CupAnchor,
  RampInfo,
  applyAirJet,
  spawnBubble,
  updateBubbles,
  PhysicsWorld,
  WATER_FRICTION_AIR,
  BALL_RADIUS,
  CUP_RADIUS,
  COLLISION_CATEGORY_BALL,
  COLLISION_CATEGORY_STATIC,
} from '../physics/engine';
import { useTiltGravity } from '../hooks/useTiltGravity';
import { LevelConfig, TargetConfig } from '../physics/levels';
import { hapticLanding, hapticLevelComplete, hapticSinkerWarning, hapticJetPress } from '../utils/haptics';
import { playCountdownTick, playBonusChime, playComboNote, playLandingNote } from '../utils/audio';

/**
 * SVG arc for a true semicircle: rim at (x±CUP_RADIUS, y), bulging down to (x, y + CUP_RADIUS).
 * sweep-flag=0 (not 1) is what picks the lower arc here — sweep=1 traces the arc through
 * increasing angle in SVG's y-down space, which passes through the *top* point first, drawing a
 * dome instead of a bowl.
 */
function cupPath(x: number, y: number) {
  return `M ${x - CUP_RADIUS} ${y} A ${CUP_RADIUS} ${CUP_RADIUS} 0 0 0 ${x + CUP_RADIUS} ${y}`;
}

/** Phase 8's cup motion: a cup's current absolute position/tilt, plus how much dx/tilt has already been physically applied to its walls so far (kept delta-based so translateCup/rotateCup calls compose correctly, mirroring rampRiseAppliedRef's pattern). */
interface CupMotionState {
  x: number;
  y: number;
  tiltDeg: number;
  appliedDx: number;
}

/** Lightens (positive percent) or darkens (negative) a "#rrggbb" color for gradient shading. */
function shadeColor(hex: string, percent: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const num = parseInt(hex.replace('#', ''), 16);
  const r = clamp(((num >> 16) & 0xff) + 255 * percent);
  const g = clamp(((num >> 8) & 0xff) + 255 * percent);
  const b = clamp((num & 0xff) + 255 * percent);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Countdown-ring color: calm through most of a ball's life, shifting to amber/red only in the
 * last ~20% of remaining time — per the "generous, just enough to notice" brief for Phase 2
 * Level 1 (urgency escalates further in later Phase 2 levels via a tick sound, not color alone).
 */
function ringColor(fraction: number): string {
  const calm = { r: 190, g: 235, b: 255 };
  const danger = { r: 255, g: 92, b: 59 };
  if (fraction > 0.2) return `rgba(${calm.r},${calm.g},${calm.b},0.85)`;
  const t = 1 - fraction / 0.2;
  const r = Math.round(calm.r + (danger.r - calm.r) * t);
  const g = Math.round(calm.g + (danger.g - calm.g) * t);
  const b = Math.round(calm.b + (danger.b - calm.b) * t);
  return `rgba(${r},${g},${b},0.9)`;
}

const ballGradientId = (color: string) => `ball-grad-${color.replace('#', '')}`;

/**
 * Shared Matter.js body options for every playable ball — the initial level-setup spawn and
 * Phase 4's bonus-ball spawn (see triggerBonus) both use this, so a bonus ball behaves identically
 * to a normal one rather than needing its own tuning.
 */
function ballBodyOptions(color: string): Matter.IBodyDefinition {
  return {
    // Higher than before (0.4) so balls bounce apart on contact rather than settling into a
    // clumped pile — low restitution combined with the ramp's constant pull toward its low point
    // made resting balls read as "stuck together".
    restitution: 0.6,
    frictionAir: WATER_FRICTION_AIR,
    // Lighter than matter's circle default (0.001) so the jet's forces — which aren't
    // mass-scaled — push these around more, and low friction so they roll down the ramp instead
    // of sticking to it.
    density: BALL_DENSITY,
    friction: 0.006,
    label: `ball-${color}`,
    // Balls collide with each other and with static geometry, never with decorative bubbles —
    // see the collision-category doc comment in physics/engine.ts.
    collisionFilter: { category: COLLISION_CATEGORY_BALL, mask: COLLISION_CATEGORY_BALL | COLLISION_CATEGORY_STATIC },
  };
}

interface Props {
  level: LevelConfig;
  onComplete: () => void;
}

interface RenderBody {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  isBubble: boolean;
  /** Phase 5's sinker ball — renders as a flat muted circle instead of a gradient-filled one. */
  isSinker?: boolean;
  /** Fraction of remaining life (1 = fresh, 0 = about to sink) — set only for levels with ballLifespanMs. */
  ringFraction?: number;
}

/** Lighter than matter's circle default (0.001) — see the ball body creation below for why. */
const BALL_DENSITY = 0.0005;
const JET_STRENGTH = 0.0013;
/** Column width right at the origin — wide from the start, like a real spray rather than a thin stream. */
const JET_BASE_COLUMN_HALF_WIDTH = 90;
/** How much the column widens per pixel risen — this is the "fan out left and right" as it climbs. */
const JET_FAN_RATE = 0.14;
/**
 * How far above the jet's origin the lift force fades to zero — see applyAirJet in
 * physics/engine.ts. Tuned just under the ~500px distance from the ramp's low point up to the
 * top cup row, so a resting top-row ball gets zero lift (safe from any hold duration) while
 * balls rising from the ramp still reliably reach that height on momentum.
 */
const JET_VERTICAL_RANGE = 490;
/** Outward push, scaled by height risen — makes trajectories fan into a widening V as they climb. */
const JET_SPREAD_STRENGTH = 0.000003;
/**
 * Jet-exhaust bubbles previously spawned every render frame a jet was held (~16.7ms) — this caps
 * it to a fixed cadence instead, cutting steady-state live bubble count roughly 5x while still
 * reading as a continuous stream (each bubble already has its own random x jitter and drifts
 * upward over its lifetime — see spawnBubble/updateBubbles in physics/engine.ts).
 */
const BUBBLE_SPAWN_INTERVAL_MS = 90;
/**
 * Fixed physics timestep: the engine now always steps in constant ~16.67ms increments via an
 * accumulator, however long the real render frame took, instead of feeding it a variable
 * `now - lastTime` delta directly. matter-js is meaningfully more consistent this way — every
 * physics force (jet, buoyancy, current, retention, ramp guide, magnet) must be reapplied once per
 * sub-step, since matter-js zeroes body.force and re-adds gravity fresh after every single
 * Engine.update call (confirmed in matter-js's own source: Body.js's applyForce only accumulates
 * into a buffer that Engine.js's _bodiesClearForces empties at the end of each update). The
 * existing 33ms outer clamp on the render-frame delta (~2x FIXED_DT) means this is 1 sub-step at a
 * steady 60fps (identical to the old behavior) or 2 on a dropped frame — MAX_SUBSTEPS is a
 * generous safety margin beyond that, not something normal play should ever reach.
 */
const FIXED_DT = 1000 / 60;
const MAX_SUBSTEPS = 3;
const RAMP_OFFSET_FROM_BOTTOM = 175;
/** How firmly balls near the ramp roll toward its low point — see applyRampGuide in physics/engine.ts. */
const RAMP_GUIDE_STRENGTH = 0.00145;
/** Cup retention spring — see applyCupRetention in physics/engine.ts. */
const CUP_RETENTION_STRENGTH = 0.00025;
/**
 * Kept tight — just past the cup's own rim — so retention only holds a ball that's actually
 * settled in the cup, not one merely floating or rising past nearby, which read as the cup
 * "attracting" or "sticking to" balls that hadn't landed in it at all.
 */
const CUP_RETENTION_RADIUS = CUP_RADIUS * 1.15;
/**
 * How forgiving "did it land" is: within this x/y window of the cup's exact center, and under this
 * velocity, a ball counts as settled — widened from an original 0.5x/0.5x/1.2 so a visible
 * near-miss still catches, without changing the cup's actual size or collision geometry (those stay
 * on CUP_RADIUS/BALL_RADIUS directly — see createCup in physics/engine.ts and cupPath below).
 */
const SETTLE_X_TOLERANCE = CUP_RADIUS * 0.85;
const SETTLE_Y_TOLERANCE = BALL_RADIUS * 0.85;
const SETTLE_VELOCITY_THRESHOLD = 1.8;
/**
 * Forward-tilt eject threshold, checked against engine.gravity.y. useTiltGravity's GRAVITY_SCALE
 * is 1.1 and its own flat-phone default is +1 (not 0), so gravity.y has to swing all the way down
 * through 0 and past -0.5 for this to fire — a large, deliberate motion well clear of normal
 * handheld jitter or the sideways/backward tilts used for regular play.
 */
const FORWARD_TILT_EJECT_GRAVITY_Y = -0.5;
/** Phase 2 Level 3's "fizzy" balls shrink to this fraction of their original size by end of life. */
const FIZZY_MIN_SCALE = 0.55;
/** Countdown tick cadence range (ms) — calm at full life, urgent as a ball nears expiry. */
const TICK_INTERVAL_CALM_MS = 900;
const TICK_INTERVAL_URGENT_MS = 200;
/**
 * Phase 3's moving-target mechanic: how far the Air Jet button can shift from center, px. Kept
 * well clear of the fixed Restart/tilt-permission buttons at the screen edges (see
 * LevelManager.tsx / GameCanvas.tsx's own bottom-corner overlays).
 */
const BUTTON_RANGE_X = 80;
/** One full left-right-left drift cycle, ms — slow and predictable per the Level 7 brief. */
const DRIFT_PERIOD_MS = 5000;
/** A fresh jump must land at least this fraction of the range away, so it always reads as a real re-aim. */
const JUMP_MIN_DISTANCE_FRACTION = 0.4;
/** Level 9's temporary second button: how often it appears, and how long it stays up. */
const TWIN_APPEAR_INTERVAL_MS = 4500;
const TWIN_VISIBLE_MS = 1800;
/** Phase 4's combo meter: a landing within this many ms of the last one extends the streak. */
const COMBO_WINDOW_MS = 3000;
/** Phase 9 Level 27's finale: a screen jitter fires once per this many combo count crossed. */
const SHAKE_COMBO_STEP = 5;
const SHAKE_MAGNITUDE_PX = 6;
const SHAKE_DURATION_MS = 140;
/** Phase 4 Level 12's rainbow bonus cup: how often it appears, and how long it stays up. */
const RAINBOW_APPEAR_INTERVAL_MS = 5500;
const RAINBOW_VISIBLE_MS = 2500;
/** Phase 5's side current: a full oscillation cycle, ms — slower than Level 7's 5s drift so it reads as "gentle". */
const CURRENT_PERIOD_MS = 8000;
const CURRENT_BASE_STRENGTH = 0.0004;
/** Phase 5's sinker ball: a muted slate gray, clearly distinct from the vibrant palette. */
const SINKER_COLOR = '#6B7280';
/** Phase 5 Level 15's rising floor: total px the ramp rises, and how long that takes. */
const RISING_WATER_TOTAL_RISE = 100;
const RISING_WATER_DURATION_MS = 40000;
/** Phase 6's golden/magnet balls: fixed reserved colors, distinct from BALL_PALETTE and SINKER_COLOR. */
const GOLD_COLOR = '#FFD700';
const MAGNET_COLOR = '#B24BF3';
const MAGNET_RADIUS = 140;
const MAGNET_STRENGTH = 0.00035;
/** Phase 6 Level 18's chargeable jet: hold past this long before releasing to add a power burst. */
const CHARGE_THRESHOLD_MS = 700;
const CHARGE_BURST_STRENGTH = JET_STRENGTH * 2.5;
/** Phase 7's split buttons: how far each sits from center, px. */
const SPLIT_OFFSET_X = 70;
/** Phase 7 Levels 20-21's combined-press center burst: stronger than a normal single-side push. */
const CENTER_BURST_STRENGTH = JET_STRENGTH * 1.8;
/** Phase 8's cup sway: how far a cup drifts from its base x, px, and one full cycle's duration. */
const CUP_SWAY_RANGE_X = 16;
const CUP_SWAY_PERIOD_MS = 6000;
/** Per-cup stagger so multiple swaying cups on the same level don't move in lockstep. */
const CUP_SWAY_PHASE_STAGGER_MS = 1100;
/** Phase 8's cup tilt: max rotation at the peak of a close, one full open->close->open cycle, and how much of that cycle is spent closing. */
const CUP_TILT_MAX_DEG = 38;
const CUP_TILT_CYCLE_MS = 4500;
const CUP_TILT_CLOSE_MS = 1400;
/** Per-cup stagger for tilt, distinct from sway's so a level combining both doesn't look mechanical. */
const CUP_TILT_PHASE_STAGGER_MS = 900;
/** Past this tilt, a cup can't hold or newly catch a ball this frame — see resolveCupTarget. */
const CUP_SETTLE_TILT_LIMIT_DEG = 15;

export function GameCanvas({ level, onComplete }: Props) {
  const { width, height } = Dimensions.get('window');
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const jetActiveRef = useRef(false);
  const filledRef = useRef<Set<string>>(new Set());
  /** Sticky-retention lock: target id -> the ball currently pinned there plus its exact rest anchor
      (captured once at lock time). Cleared on level (re)mount and on every forward-tilt eject. */
  const lockedBallsRef = useRef<Map<string, { body: Matter.Body; x: number; restY: number }>>(new Map());
  const wonRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const jetXRef = useRef(width / 2);
  const jetYRef = useRef(height);
  const cupAnchorsRef = useRef<CupAnchor[]>([]);
  /** Phase 2's ball-lifecycle mechanic: body id -> accumulated ms spent "unsafe" (not settled in a cup). */
  const ballAgeRef = useRef<Map<number, number>>(new Map());
  /** Phase 2 Level 3's fizzy shrink: body id -> current scale factor relative to its original size. */
  const ballScaleRef = useRef<Map<number, number>>(new Map());
  /** Phase 2 Levels 2-3's countdown tick: timestamp the next tick is allowed to play. */
  const nextTickAtRef = useRef(0);
  /** Jet-exhaust bubble throttle: timestamp each independent spawn site is next allowed to fire —
      one per site (left jet, secondary/right jet, Phase 7's center burst) so simultaneous jets
      don't starve each other's cooldown. */
  const leftBubbleNextAtRef = useRef(0);
  const rightBubbleNextAtRef = useRef(0);
  const centerBubbleNextAtRef = useRef(0);
  /** Fixed-timestep physics: leftover render-frame time not yet consumed by a FIXED_DT sub-step. */
  const accumulatorRef = useRef(0);
  /** Phase 3's moving-target mechanic: primary button's current x offset from center, px. */
  const buttonOffsetRef = useRef(0);
  /** Level 9's temporary second button: whether it's currently held, and its own x offset. */
  const secondaryActiveRef = useRef(false);
  const secondaryOffsetRef = useRef(0);
  /** Level 9's temporary second button: ms timestamps driving its appear/hide schedule. */
  const twinNextAtRef = useRef(0);
  const twinHideAtRef = useRef(0);
  const twinVisibleRef = useRef(false);
  /** Phase 4's chain-match mechanic: keys of matchRows groups that have already fired their bonus this level instance. */
  const matchedRowsRef = useRef<Set<string>>(new Set());
  /** Phase 4's combo meter: current streak length, and the timestamp of the last landing. */
  const comboCountRef = useRef(0);
  const comboLastLandingAtRef = useRef(0);
  /** Phase 4 Level 12's rainbow bonus cup: which target (if any) is currently active, and its schedule. */
  const rainbowTargetIdRef = useRef<string | null>(null);
  const rainbowNextAtRef = useRef(0);
  const rainbowHideAtRef = useRef(0);
  /** Phase 5's rising floor: when this level instance started, and how much rise has been applied so far. */
  const levelStartAtRef = useRef(0);
  const rampRiseAppliedRef = useRef(0);
  const rampInfoRef = useRef<RampInfo | null>(null);
  /** Phase 5's sinker ball: whether one is currently settled in any cup, to edge-detect the warning haptic. */
  const sinkerInCupRef = useRef(false);
  /** Phase 6's golden ball: whether its one-time auto-fill bonus has already fired this level instance. */
  const goldenTriggeredRef = useRef(false);
  /** Phase 6 Level 18's chargeable jet: timestamp the current press started, for measuring hold duration on release. */
  const jetHoldStartAtRef = useRef(0);
  /** Phase 6's magnet ball: whether it was settled as of the previous frame's settle check. */
  const magnetSettledRef = useRef(false);
  /** Phase 7 Level 21's swipe-to-angle: current drag-biased x offset for each split button's jet. */
  const leftSwipeAngleRef = useRef(0);
  const rightSwipeAngleRef = useRef(0);
  /** Phase 8's cup motion: target id -> its physical wall segments, for translate/rotate. */
  const cupWallsRef = useRef<Map<string, Matter.Body[]>>(new Map());
  /** Phase 8's cup motion: target id -> its current absolute position/tilt and how much of each has already been applied to the physical walls so far (kept delta-based like rampRiseAppliedRef). */
  const cupMotionRef = useRef<Map<string, CupMotionState>>(new Map());
  /** Phase 9 Level 27's finale: current shake jitter and when it decays back to 0 by, plus the last combo-multiple-of-SHAKE_COMBO_STEP that already fired a jitter (edge-detection so it fires once per newly-crossed threshold, not every frame past it). */
  const shakeOffsetRef = useRef({ x: 0, y: 0 });
  const shakeUntilRef = useRef(0);
  const comboShakeThresholdRef = useRef(0);
  const [renderBodies, setRenderBodies] = useState<RenderBody[]>([]);
  const [filledIds, setFilledIds] = useState<string[]>([]);
  const [engineVersion, setEngineVersion] = useState(0);
  const [buttonOffsetX, setButtonOffsetX] = useState(0);
  const [twinOffsetX, setTwinOffsetX] = useState<number | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [rainbowTargetId, setRainbowTargetId] = useState<string | null>(null);
  const [rampRise, setRampRise] = useState(0);
  const [charging, setCharging] = useState(false);
  const [cupMotionSnapshot, setCupMotionSnapshot] = useState<Record<string, CupMotionState>>({});
  const [shakeOffset, setShakeOffsetState] = useState({ x: 0, y: 0 });

  const { needsPermission, requestPermission } = useTiltGravity(physicsRef.current?.engine ?? null);

  const rampBaseY = height - RAMP_OFFSET_FROM_BOTTOM;
  // Phase 5 Level 15's rising floor moves the ramp upward over time (see rampRiseAppliedRef in the
  // setup effect below) — recomputed from rampRise state each render so the rendered <Line>s track
  // the physical ramp bodies, which stay 0 (no visible change) for every level without risingWater.
  const ramp = computeRampPoints(width, rampBaseY - rampRise);

  useEffect(() => {
    const pw = createPhysicsWorld(width, height);
    physicsRef.current = pw;
    setEngineVersion((v) => v + 1);
    const rampInfo = createVRamp(pw.world, width, rampBaseY);
    rampInfoRef.current = rampInfo;
    jetXRef.current = rampInfo.lowPoint.x;
    jetYRef.current = rampInfo.lowPoint.y;

    cupWallsRef.current.clear();
    cupMotionRef.current.clear();
    cupAnchorsRef.current = level.targets.map((target) => {
      const cup = createCup(pw.world, width / 2 + target.dx, target.y, target.id);
      cupWallsRef.current.set(target.id, cup.segments);
      cupMotionRef.current.set(target.id, {
        x: width / 2 + target.dx,
        y: target.y,
        tiltDeg: 0,
        appliedDx: 0,
      });
      return { x: width / 2 + target.dx, restY: cup.restY };
    });

    level.pegs.forEach((peg) => {
      createPeg(pw.world, width / 2 + peg.dx, peg.y);
    });

    // Cluster balls in a small grid above the ramp's low point, like the pooled balls on the
    // real toy, instead of a single spread-out row.
    const cols = Math.min(6, level.ballCount);
    const spacing = BALL_RADIUS * 2 + 4;
    const sinkerCount = level.sinkerCount ?? 0;
    const goldenCount = level.goldenCount ?? 0;
    const magnetCount = level.magnetCount ?? 0;
    const balls = level.ballColors.slice(0, level.ballCount).map((color, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, level.ballCount - row * cols);
      const rowStartX = rampInfo.lowPoint.x - ((rowCount - 1) * spacing) / 2;
      // Reserve trailing slots for each special ball type, sinker first — Phase 5/6 levels never
      // combine more than one of these, but reserving in a fixed order keeps this correct even if
      // a future level did.
      const isSinker = i >= level.ballCount - sinkerCount;
      const isGolden = !isSinker && i >= level.ballCount - sinkerCount - goldenCount;
      const isMagnet = !isSinker && !isGolden && i >= level.ballCount - sinkerCount - goldenCount - magnetCount;
      // Phase 5's sinker ball: a 'sinker-' label instead of 'ball-' — physically identical (same
      // ballBodyOptions), but every settle/win-condition check filters on the 'ball-' prefix, so a
      // sinker can occupy a cup without ever counting toward filling it. Golden/magnet balls stay
      // 'ball-' labeled (they DO count toward filling their cup) and are only distinguished by a
      // reserved color.
      let options: Matter.IBodyDefinition;
      if (isSinker) options = { ...ballBodyOptions(SINKER_COLOR), label: `sinker-${SINKER_COLOR}` };
      else if (isGolden) options = ballBodyOptions(GOLD_COLOR);
      else if (isMagnet) options = ballBodyOptions(MAGNET_COLOR);
      else options = ballBodyOptions(color);
      return Matter.Bodies.circle(rowStartX + col * spacing, rampInfo.lowPoint.y - 24 - row * spacing, BALL_RADIUS, options);
    });
    Matter.World.add(pw.world, balls);

    filledRef.current = new Set();
    lockedBallsRef.current = new Map();
    wonRef.current = false;
    ballAgeRef.current = new Map();
    ballScaleRef.current = new Map();
    nextTickAtRef.current = 0;
    leftBubbleNextAtRef.current = 0;
    rightBubbleNextAtRef.current = 0;
    centerBubbleNextAtRef.current = 0;
    accumulatorRef.current = 0;
    buttonOffsetRef.current = 0;
    secondaryActiveRef.current = false;
    secondaryOffsetRef.current = 0;
    twinNextAtRef.current = Date.now() + TWIN_APPEAR_INTERVAL_MS;
    twinHideAtRef.current = 0;
    twinVisibleRef.current = false;
    matchedRowsRef.current = new Set();
    comboCountRef.current = 0;
    comboLastLandingAtRef.current = 0;
    rainbowTargetIdRef.current = null;
    rainbowNextAtRef.current = Date.now() + RAINBOW_APPEAR_INTERVAL_MS;
    rainbowHideAtRef.current = 0;
    levelStartAtRef.current = Date.now();
    rampRiseAppliedRef.current = 0;
    sinkerInCupRef.current = false;
    goldenTriggeredRef.current = false;
    jetHoldStartAtRef.current = 0;
    magnetSettledRef.current = false;
    leftSwipeAngleRef.current = 0;
    rightSwipeAngleRef.current = 0;
    shakeOffsetRef.current = { x: 0, y: 0 };
    shakeUntilRef.current = 0;
    comboShakeThresholdRef.current = 0;

    setButtonOffsetX(0);
    setTwinOffsetX(null);
    setComboCount(0);
    setRainbowTargetId(null);
    setRampRise(0);
    setCharging(false);
    setCupMotionSnapshot({});
    setShakeOffsetState({ x: 0, y: 0 });

    let lastTime = Date.now();
    const loop = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      const twinVisible = updateButtonMotion(
        level,
        now,
        buttonOffsetRef,
        secondaryOffsetRef,
        secondaryActiveRef,
        twinVisibleRef,
        twinNextAtRef,
        twinHideAtRef
      );
      if (level.buttonMotion) jetXRef.current = width / 2 + buttonOffsetRef.current;

      // Phase 5 Level 15's rising floor: gradually translates the ramp's static bodies upward
      // over RISING_WATER_DURATION_MS, dragging the jet origin with it. Cup positions never move
      // (they're fixed in level.targets), so a rising ramp is exactly "shrinks the vertical
      // distance balls need to travel" — no cup/geometry changes needed anywhere else.
      if (level.risingWater && rampInfoRef.current) {
        const elapsed = now - levelStartAtRef.current;
        const progress = Math.min(1, Math.max(0, elapsed / RISING_WATER_DURATION_MS));
        const targetRise = progress * RISING_WATER_TOTAL_RISE;
        const riseDelta = targetRise - rampRiseAppliedRef.current;
        if (riseDelta !== 0) {
          Matter.Body.translate(rampInfoRef.current.leftSeg, { x: 0, y: -riseDelta });
          Matter.Body.translate(rampInfoRef.current.rightSeg, { x: 0, y: -riseDelta });
          jetYRef.current -= riseDelta;
          rampRiseAppliedRef.current = targetRise;
        }
      }
      const currentRampBaseY = rampBaseY - rampRiseAppliedRef.current;

      // Phase 8's cup motion: no-ops immediately when level.cupMotion is unset, so this is inert
      // by construction for every earlier phase — see updateCupMotion's own doc comment.
      updateCupMotion(level, now, width, cupWallsRef, cupMotionRef);
      if (level.cupMotion) {
        // Keep retention anchors following the moving cup, not its static level.targets position —
        // otherwise the spring would fight the sway/tilt instead of tracking it.
        level.targets.forEach((t, i) => {
          const state = cupMotionRef.current.get(t.id);
          if (state) cupAnchorsRef.current[i] = { x: state.x, restY: cupAnchorsRef.current[i].restY };
        });
      }

      const anyJetActive = jetActiveRef.current || secondaryActiveRef.current;
      // Phase 7's split buttons: each side gets its own fixed x (offset by that side's swipe-drag
      // bias on Level 21) and a hard clip to its own half — a normal jetXRef/secondaryOffsetRef
      // (Phase 3's moving-button state, unused on Phase 7 levels since they never set
      // buttonMotion) only applies when the level isn't split, so Phase 3/9 behavior is untouched.
      const leftJetX = level.splitButtons ? width / 2 - SPLIT_OFFSET_X + leftSwipeAngleRef.current : jetXRef.current;
      const rightJetX = level.splitButtons ? width / 2 + SPLIT_OFFSET_X + rightSwipeAngleRef.current : width / 2 + secondaryOffsetRef.current;
      const leftClip = level.splitButtons ? { max: width / 2 } : undefined;
      const rightClip = level.splitButtons ? { min: width / 2 } : undefined;
      const isCenterBurstActive = !!level.splitButtons && level.splitButtons !== 'basic' && jetActiveRef.current && secondaryActiveRef.current;

      // Jet-exhaust bubbles are cosmetic, throttled, wall-clock-timed effects — spawn them once per
      // render frame here (not once per physics sub-step below), same cadence as before this change.
      if (jetActiveRef.current && now >= leftBubbleNextAtRef.current) {
        spawnBubble(pw.world, leftJetX, height - 80);
        leftBubbleNextAtRef.current = now + BUBBLE_SPAWN_INTERVAL_MS;
      }
      if (secondaryActiveRef.current && now >= rightBubbleNextAtRef.current) {
        spawnBubble(pw.world, rightJetX, height - 80);
        rightBubbleNextAtRef.current = now + BUBBLE_SPAWN_INTERVAL_MS;
      }
      if (isCenterBurstActive && now >= centerBubbleNextAtRef.current) {
        spawnBubble(pw.world, width / 2, height - 80);
        centerBubbleNextAtRef.current = now + BUBBLE_SPAWN_INTERVAL_MS;
      }
      updateBubbles(pw.world, 1600);

      // Fixed-timestep physics: matter-js zeroes body.force (and re-applies gravity) after every
      // single Engine.update call, so every force below must be reapplied once per physics
      // sub-step, not once per render frame — see the module-level doc comment on FIXED_DT. The
      // existing 33ms outer clamp on `delta` (~2x FIXED_DT) already bounds this to at most 2
      // sub-steps in normal operation; MAX_SUBSTEPS is a generous safety margin beyond that, not a
      // load-bearing limit.
      accumulatorRef.current += delta;
      let substeps = 0;
      while (accumulatorRef.current >= FIXED_DT && substeps < MAX_SUBSTEPS) {
        // Computed fresh each sub-step (not hoisted above the loop) since Matter.Engine.update can
        // move bodies between sub-steps — though within one render frame nothing gets added/removed
        // (that only happens in the Bucket-B tail below, after this loop), so the composite tree's
        // membership itself never changes here, only positions/velocities.
        const bodiesThisSubstep = Matter.Composite.allBodies(pw.world);

        applyWaterPhysics(bodiesThisSubstep);
        if (level.magnetCount && !magnetSettledRef.current) {
          // Phase 6's magnet ball: pulls nearby floating balls toward it while it's still in
          // flight. Gated on last frame's settle status (magnetSettledRef, updated after this
          // frame's settle check below) rather than re-deriving it here, since settledBalls is only
          // known post-update — a one-frame lag that's imperceptible at 60fps.
          const magnetBall = bodiesThisSubstep.find((b) => b.label === `ball-${MAGNET_COLOR}`);
          if (magnetBall) {
            applyMagnetAttraction(bodiesThisSubstep, magnetBall, MAGNET_RADIUS, MAGNET_STRENGTH);
          }
        }
        if (level.sideCurrent) {
          // Phase 5's side current: a smooth, continuously-oscillating sideways force (sine wave,
          // like Level 7's button drift) rather than a one-way push, so balls don't just pile up
          // against one wall over time. Phase 9's paceMultiplier (default 1) shortens the period —
          // dividing rather than a separate constant, so it composes with the existing wave shape.
          // Reuses this render frame's `now` for every sub-step (rather than a separately-advancing
          // simulated clock) — the oscillation only needs to feel continuous in real time, and this
          // matches the fidelity this force already had before fixed-timestep (evaluated once per
          // render frame either way).
          const pace = level.paceMultiplier ?? 1;
          const currentStrength = CURRENT_BASE_STRENGTH * Math.sin((now / (CURRENT_PERIOD_MS / pace)) * 2 * Math.PI);
          applyCurrent(bodiesThisSubstep, currentStrength);
        }
        // Note: the ramp's low point is always the fixed screen-center x (see computeRampPoints),
        // NOT jetXRef — those two only coincided by construction before Phase 3, where the jet
        // origin was permanently parked at the ramp's low point. Now that jetXRef can move with the
        // Air Jet button, the roll-to-center guide must keep targeting the ramp's actual (unmoving,
        // except for Level 15's rising floor, which currentRampBaseY tracks) geometry, not wherever
        // the button currently is.
        applyRampGuide(bodiesThisSubstep, width / 2, currentRampBaseY, RAMP_GUIDE_STRENGTH);

        if (anyJetActive) {
          // Retention only opposes the jet, not general gravity/tilt: gravity forces are
          // mass-scaled and these balls are light, so a retention strength that meaningfully
          // resists the (unscaled) jet is strong enough to make even extreme tilt unable to
          // dislodge a ball at all — defeating "tips the phone a lot" entirely. Gating retention to
          // "jet held" keeps tilt working through plain gravity + the cup's rigid walls, same as
          // if this feature didn't exist, while still protecting against jet disturbance.
          applyCupRetention(bodiesThisSubstep, cupAnchorsRef.current, CUP_RETENTION_STRENGTH, CUP_RETENTION_RADIUS);
        }

        if (jetActiveRef.current) {
          applyAirJet(
            pw.world,
            leftJetX,
            jetYRef.current,
            JET_STRENGTH,
            JET_BASE_COLUMN_HALF_WIDTH,
            JET_VERTICAL_RANGE,
            JET_FAN_RATE,
            JET_SPREAD_STRENGTH,
            leftClip
          );
        }
        if (secondaryActiveRef.current) {
          // Level 9's temporary second button (or Phase 7's permanent right button): an independent
          // jet at its own x, reusing the exact same shape/strength constants and functions as the
          // primary — applyAirJet already takes an arbitrary origin x (and now an optional clip), so
          // no new physics function was needed to support a second one.
          applyAirJet(
            pw.world,
            rightJetX,
            jetYRef.current,
            JET_STRENGTH,
            JET_BASE_COLUMN_HALF_WIDTH,
            JET_VERTICAL_RANGE,
            JET_FAN_RATE,
            JET_SPREAD_STRENGTH,
            rightClip
          );
        }
        if (isCenterBurstActive) {
          // Phase 7 Levels 20-21: pressing both together adds a strong, unclipped center burst that
          // reaches the middle column neither half-restricted side jet can reach alone — the actual
          // payoff for "pressing both together".
          applyAirJet(
            pw.world,
            width / 2,
            jetYRef.current,
            CENTER_BURST_STRENGTH,
            JET_BASE_COLUMN_HALF_WIDTH,
            JET_VERTICAL_RANGE,
            JET_FAN_RATE,
            JET_SPREAD_STRENGTH
          );
        }

        Matter.Engine.update(pw.engine, FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
        substeps++;
      }
      if (substeps === MAX_SUBSTEPS) accumulatorRef.current = 0; // drop backlog rather than spiral after e.g. a backgrounded tab

      // Forward-tilt eject: a strongly negative gravity.y means the player tipped the phone's top
      // edge away from them. Release every locked ball back to normal physics (no extra impulse
      // needed — gravity is already pulling hard that way). Must run AFTER Matter.Engine.update so
      // the pin below is the last word on position/velocity for this step.
      const isForwardTiltEject = pw.engine.gravity.y < FORWARD_TILT_EJECT_GRAVITY_Y;
      if (isForwardTiltEject) {
        lockedBallsRef.current.clear();
      } else {
        for (const locked of lockedBallsRef.current.values()) {
          lockBallAtAnchor(locked.body, locked);
        }
      }

      const settledBalls = computeSettledBalls(pw, level, width, cupMotionRef);
      // Newly-settled balls on a stickyRetention level start locking the frame they settle. The
      // !isForwardTiltEject guard matters: a ball just ejected this same frame is still sitting
      // almost exactly at its old rest position with ~0 velocity after one physics step, and would
      // otherwise immediately satisfy computeSettledBalls and get re-locked, silently canceling the
      // eject.
      if (level.stickyRetention && !isForwardTiltEject) {
        for (const [targetId, ball] of settledBalls) {
          if (lockedBallsRef.current.has(targetId)) continue;
          const idx = level.targets.findIndex((t) => t.id === targetId);
          const anchor = cupAnchorsRef.current[idx];
          if (anchor) lockedBallsRef.current.set(targetId, { body: ball, x: anchor.x, restY: anchor.restY });
        }
      }
      const { changed: filledChanged, newlyFilled } = checkTargets(settledBalls, level, filledRef.current, wonRef, () => {
        hapticLevelComplete();
        setTimeout(onComplete, 1200);
      });
      if (filledChanged) setFilledIds(Array.from(filledRef.current));
      if (newlyFilled.length > 0 && !level.finaleEffects) {
        playLandingNote(filledRef.current.size / level.targets.length);
      }

      updateBallLifecycle(pw, level, settledBalls, ballAgeRef.current, ballScaleRef.current, delta);
      updateCountdownTick(pw, level, settledBalls, ballAgeRef.current, nextTickAtRef, now);

      const rampLowX = width / 2;
      const rampLowY = currentRampBaseY;
      const spawnBonus = (x: number, y: number) => triggerBonus(pw, level, x, y, rampLowX, rampLowY);
      checkChainMatches(level, settledBalls, matchedRowsRef, width, spawnBonus);
      updateComboMeter(level, newlyFilled, comboCountRef, comboLastLandingAtRef, now);
      if (level.finaleEffects) {
        const setShakeOffset = (offset: { x: number; y: number }) => {
          shakeOffsetRef.current = offset;
          shakeUntilRef.current = now + SHAKE_DURATION_MS;
        };
        triggerFinaleEffects(newlyFilled, comboCountRef.current, comboShakeThresholdRef, setShakeOffset);
      }
      const rainbowVisibleId = updateRainbowCup(
        level,
        now,
        settledBalls,
        rainbowTargetIdRef,
        rainbowNextAtRef,
        rainbowHideAtRef,
        width,
        spawnBonus
      );

      if (level.sinkerCount) {
        const settledSinkers = computeSettledSinkers(pw, level, width, cupMotionRef);
        const anySinkerSettled = settledSinkers.size > 0;
        if (anySinkerSettled && !sinkerInCupRef.current) {
          hapticSinkerWarning();
        }
        sinkerInCupRef.current = anySinkerSettled;
      }

      if (level.magnetCount) {
        magnetSettledRef.current = Array.from(settledBalls.values()).some((b) => b.label === `ball-${MAGNET_COLOR}`);
      }

      triggerGoldenBonus(pw, level, settledBalls, filledRef.current, goldenTriggeredRef, width);

      const isCharging = !!level.chargeableJet && jetActiveRef.current && now - jetHoldStartAtRef.current >= CHARGE_THRESHOLD_MS;
      setCharging(isCharging);

      setButtonOffsetX(buttonOffsetRef.current);
      setTwinOffsetX(twinVisible ? secondaryOffsetRef.current : null);
      setComboCount(comboCountRef.current);
      setRainbowTargetId(rainbowVisibleId);
      setRampRise(rampRiseAppliedRef.current);
      if (level.cupMotion) setCupMotionSnapshot(Object.fromEntries(cupMotionRef.current));
      if (level.finaleEffects) {
        // Linear decay back to 0 over SHAKE_DURATION_MS — a plain per-frame ref->setState mirror,
        // matching rampRise/cupMotionSnapshot's pattern rather than introducing Animated.Value.
        const remaining = Math.max(0, shakeUntilRef.current - now);
        const decay = remaining / SHAKE_DURATION_MS;
        setShakeOffsetState({ x: shakeOffsetRef.current.x * decay, y: shakeOffsetRef.current.y * decay });
      }

      const bodies = Matter.Composite.allBodies(pw.world).filter((b) => !b.isStatic);
      setRenderBodies(
        bodies.map((b) => {
          const isBall = b.label.startsWith('ball-');
          const isSinker = b.label.startsWith('sinker-');
          const ringFraction =
            isBall && level.ballLifespanMs
              ? Math.max(0, 1 - (ballAgeRef.current.get(b.id) ?? 0) / level.ballLifespanMs)
              : undefined;
          return {
            id: b.id,
            x: b.position.x,
            y: b.position.y,
            radius: (b as any).circleRadius ?? 10,
            color: isBall ? b.label.replace('ball-', '') : isSinker ? SINKER_COLOR : '#EAFBFF',
            isBubble: b.label === 'bubble',
            isSinker,
            ringFraction,
          };
        })
      );

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      Matter.World.clear(pw.world, false);
      Matter.Engine.clear(pw.engine);
    };
  }, [level, width, height, onComplete]);

  const handleHoldChange = useCallback(
    (active: boolean) => {
      if (level.chargeableJet) {
        if (active) {
          jetHoldStartAtRef.current = Date.now();
        } else if (jetActiveRef.current && Date.now() - jetHoldStartAtRef.current >= CHARGE_THRESHOLD_MS) {
          // Phase 6 Level 18: a hold that reached the charge threshold gets one extra strong
          // burst on release, on top of whatever the continuous hold already applied every frame
          // — reusing applyAirJet (the same function the continuous hold calls) at a higher
          // strength, just once, rather than a new physics primitive. matter-js accumulates any
          // force applied before the next Engine.update regardless of caller, so this integrates
          // correctly even though it's fired from a UI event outside the animation loop.
          const pw = physicsRef.current;
          if (pw) {
            applyAirJet(
              pw.world,
              jetXRef.current,
              jetYRef.current,
              CHARGE_BURST_STRENGTH,
              JET_BASE_COLUMN_HALF_WIDTH,
              JET_VERTICAL_RANGE,
              JET_FAN_RATE,
              JET_SPREAD_STRENGTH
            );
            spawnBubble(pw.world, jetXRef.current, jetYRef.current);
            spawnBubble(pw.world, jetXRef.current, jetYRef.current);
          }
          hapticJetPress();
        }
      }

      // Phase 3 Levels 8-9: jump to a new spot the instant the button is released, so every
      // press requires a fresh re-aim. Checked against the *previous* value (before overwriting
      // it below) so this only fires on a genuine press->release transition, not every frame.
      if (!active && jetActiveRef.current && (level.buttonMotion === 'jump' || level.buttonMotion === 'twin')) {
        buttonOffsetRef.current = pickJumpOffset(buttonOffsetRef.current);
      }
      jetActiveRef.current = active;
    },
    [level.buttonMotion, level.chargeableJet]
  );

  const handleSecondaryHoldChange = useCallback((active: boolean) => {
    secondaryActiveRef.current = active;
  }, []);

  const handleLeftSwipeAngle = useCallback((dx: number) => {
    leftSwipeAngleRef.current = dx;
  }, []);

  const handleRightSwipeAngle = useCallback((dx: number) => {
    rightSwipeAngleRef.current = dx;
  }, []);

  return (
    <View
      style={{
        flex: 1,
        transform: level.finaleEffects ? [{ translateX: shakeOffset.x }, { translateY: shakeOffset.y }] : undefined,
      }}
    >
      <Tank width={width} height={height} tintHue={level.finaleEffects ? 200 + Math.min(comboCount, 12) * 12 : undefined} />
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          {/* Always include GOLD_COLOR/MAGNET_COLOR here (not just level.ballColors) — Phase 6's
              golden/magnet balls use these as their label color but aren't part of a level's own
              palette, so without this their gradient lookup below would silently miss and render
              invisible (no fill) rather than error. */}
          {Array.from(new Set([...level.ballColors, GOLD_COLOR, MAGNET_COLOR])).map((color) => (
            <RadialGradient key={color} id={ballGradientId(color)} cx="35%" cy="30%" r="75%">
              <Stop offset="0%" stopColor={shadeColor(color, 0.55)} />
              <Stop offset="55%" stopColor={color} />
              <Stop offset="100%" stopColor={shadeColor(color, -0.35)} />
            </RadialGradient>
          ))}
          {level.rainbowCup && (
            <LinearGradient id="rainbowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#FF3B7F" />
              <Stop offset="25%" stopColor="#FFD23B" />
              <Stop offset="50%" stopColor="#3BFFA0" />
              <Stop offset="75%" stopColor="#3BD6FF" />
              <Stop offset="100%" stopColor="#8A5CFF" />
            </LinearGradient>
          )}
        </Defs>
        <Line
          x1={ramp.leftPoint.x}
          y1={ramp.leftPoint.y}
          x2={ramp.lowPoint.x}
          y2={ramp.lowPoint.y}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Line
          x1={ramp.lowPoint.x}
          y1={ramp.lowPoint.y}
          x2={ramp.rightPoint.x}
          y2={ramp.rightPoint.y}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        {level.pegs.map((p) => (
          <Circle key={p.id} cx={width / 2 + p.dx} cy={p.y} r={6} fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.8)" strokeWidth={1} />
        ))}
        {level.targets.map((t) => {
          const isRainbow = t.id === rainbowTargetId;
          const dyn = level.cupMotion ? cupMotionSnapshot[t.id] : undefined;
          const cx = dyn?.x ?? width / 2 + t.dx;
          const cy = dyn?.y ?? t.y;
          const tiltDeg = dyn?.tiltDeg ?? 0;
          const closed = Math.abs(tiltDeg) > CUP_SETTLE_TILT_LIMIT_DEG;
          return (
            <Path
              key={t.id}
              d={cupPath(cx, cy)}
              transform={tiltDeg ? `rotate(${tiltDeg} ${cx} ${cy})` : undefined}
              fill={
                isRainbow
                  ? 'rgba(255,255,255,0.3)'
                  : closed
                  ? 'rgba(255,80,80,0.2)'
                  : filledIds.includes(t.id)
                  ? 'rgba(255,210,59,0.35)'
                  : 'rgba(255,255,255,0.15)'
              }
              stroke={
                isRainbow
                  ? 'url(#rainbowGradient)'
                  : closed
                  ? 'rgba(255,120,120,0.8)'
                  : filledIds.includes(t.id)
                  ? '#FFD23B'
                  : 'rgba(255,255,255,0.65)'
              }
              strokeWidth={isRainbow ? 6 : 5}
              strokeLinecap="round"
            />
          );
        })}
        {renderBodies.map((b) => (
          <React.Fragment key={b.id}>
            <Circle
              cx={b.x}
              cy={b.y}
              r={b.radius}
              fill={b.isBubble ? 'rgba(255,255,255,0.55)' : b.isSinker ? SINKER_COLOR : `url(#${ballGradientId(b.color)})`}
              opacity={b.isBubble ? 0.6 : 1}
            />
            {b.ringFraction !== undefined &&
              (() => {
                const ringRadius = b.radius + 4;
                const circumference = 2 * Math.PI * ringRadius;
                return (
                  <Circle
                    cx={b.x}
                    cy={b.y}
                    r={ringRadius}
                    fill="none"
                    stroke={ringColor(b.ringFraction)}
                    strokeWidth={2}
                    strokeDasharray={`${circumference * b.ringFraction} ${circumference}`}
                    strokeLinecap="round"
                  />
                );
              })()}
          </React.Fragment>
        ))}
      </Svg>
      {comboCount > 1 && (
        <View style={styles.comboPill} pointerEvents="none">
          <Text style={styles.comboText}>Combo ×{comboCount}</Text>
        </View>
      )}
      <AirJetButton
        onHoldChange={handleHoldChange}
        offsetX={level.splitButtons ? -SPLIT_OFFSET_X : buttonOffsetX}
        charging={charging}
        swipeEnabled={level.splitButtons === 'swipe'}
        onSwipeAngle={level.splitButtons === 'swipe' ? handleLeftSwipeAngle : undefined}
      />
      {(twinOffsetX !== null || !!level.splitButtons) && (
        <AirJetButton
          onHoldChange={handleSecondaryHoldChange}
          offsetX={level.splitButtons ? SPLIT_OFFSET_X : twinOffsetX ?? 0}
          variant={level.splitButtons ? 'primary' : 'ghost'}
          swipeEnabled={level.splitButtons === 'swipe'}
          onSwipeAngle={level.splitButtons === 'swipe' ? handleRightSwipeAngle : undefined}
        />
      )}
      {needsPermission && (
        <View style={styles.permissionOverlay} pointerEvents="box-none">
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Enable Tilt Controls</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  permissionOverlay: {
    position: 'absolute',
    bottom: 64,
    left: 20,
    maxWidth: 110,
  },
  permissionButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  comboPill: {
    position: 'absolute',
    top: 108,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,210,59,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  comboText: {
    color: '#FFD23B',
    fontWeight: '700',
    fontSize: 14,
  },
});

/**
 * Phase 3's moving-target mechanic. No-op (returns false) when the level has no buttonMotion, so
 * Phase 1/2 levels are unaffected.
 *
 * 'drift' sways buttonOffsetRef continuously via a sine wave — smooth and fully predictable.
 * 'jump'/'twin' don't move the primary button here at all; that only happens on release, handled
 * in GameCanvas's handleHoldChange (this function only needs to run every frame for drift and for
 * the twin-button schedule).
 *
 * Returns whether Level 9's temporary second button should currently be visible/rendered. Its
 * position (secondaryOffsetRef) is set once at the moment it appears — opposite whichever side the
 * primary button is currently on — and held fixed until it hides, even if the primary jumps to a
 * new spot while the ghost is up, so the ghost doesn't visibly relocate mid-appearance.
 */
function updateButtonMotion(
  level: LevelConfig,
  now: number,
  buttonOffsetRef: React.MutableRefObject<number>,
  secondaryOffsetRef: React.MutableRefObject<number>,
  secondaryActiveRef: React.MutableRefObject<boolean>,
  twinVisibleRef: React.MutableRefObject<boolean>,
  twinNextAtRef: React.MutableRefObject<number>,
  twinHideAtRef: React.MutableRefObject<number>
): boolean {
  if (level.buttonMotion === 'drift') {
    buttonOffsetRef.current = Math.sin((now / DRIFT_PERIOD_MS) * 2 * Math.PI) * BUTTON_RANGE_X;
  }

  if (level.buttonMotion !== 'twin') return false;

  if (!twinVisibleRef.current && now >= twinNextAtRef.current) {
    secondaryOffsetRef.current = -Math.sign(buttonOffsetRef.current || 1) * BUTTON_RANGE_X;
    twinHideAtRef.current = now + TWIN_VISIBLE_MS;
    twinVisibleRef.current = true;
  } else if (twinVisibleRef.current && now >= twinHideAtRef.current) {
    twinVisibleRef.current = false;
    secondaryActiveRef.current = false; // held mid-hide: stop its jet cleanly rather than leaving it stuck on
    twinNextAtRef.current = now + TWIN_APPEAR_INTERVAL_MS;
  }

  return twinVisibleRef.current;
}

/**
 * Triangular wave for Phase 8's tilt mechanic: a cup sits open (0deg) for most of
 * CUP_TILT_CYCLE_MS, then ramps 0->CUP_TILT_MAX_DEG->0 over the final CUP_TILT_CLOSE_MS of the
 * cycle, so it reads as a deliberate close-and-reopen rather than a constant wobble. Phase 9's
 * paceMultiplier (default 1) shortens both the cycle and close window, for "quicker tilts" — the
 * per-cup phase stagger passed in via `now` is left un-scaled by the caller so speeding up doesn't
 * also resync all cups' tilts.
 */
function computeCupTiltDeg(now: number, pace: number = 1): number {
  const cycleMs = CUP_TILT_CYCLE_MS / pace;
  const closeMs = CUP_TILT_CLOSE_MS / pace;
  const t = now % cycleMs;
  const openMs = cycleMs - closeMs;
  if (t < openMs) return 0;
  const closeT = t - openMs;
  const half = closeMs / 2;
  const frac = closeT < half ? closeT / half : (closeMs - closeT) / half;
  return frac * CUP_TILT_MAX_DEG;
}

/**
 * Phase 8's cup motion: no-ops immediately when level.cupMotion is unset, so it never touches
 * cupWallsRef's bodies or cupMotionRef's state for any Phase 1-7 level. Otherwise, for each target
 * (staggered by its index in level.targets so multiple cups don't move in lockstep), computes a
 * desired sway offset and/or tilt angle, diffs against what's already been applied to get an
 * incremental delta (mirrors the rising-floor's rampRiseAppliedRef pattern), and physically
 * translates/rotates the real cup-wall Matter bodies by that delta — this is a genuine physical
 * move, not a visual-only trick, so a ball resting against a tilting wall actually gets displaced.
 */
function updateCupMotion(
  level: LevelConfig,
  now: number,
  width: number,
  cupWallsRef: React.MutableRefObject<Map<string, Matter.Body[]>>,
  cupMotionRef: React.MutableRefObject<Map<string, CupMotionState>>
) {
  if (!level.cupMotion) return;
  const swayActive = level.cupMotion === 'sway' || level.cupMotion === 'full';
  const tiltActive = level.cupMotion === 'tilt' || level.cupMotion === 'full';

  (level.targets as TargetConfig[]).forEach((t, i) => {
    const state = cupMotionRef.current.get(t.id);
    if (!state) return;
    const baseX = width / 2 + t.dx;

    const desiredDx = swayActive
      ? Math.sin(((now + i * CUP_SWAY_PHASE_STAGGER_MS) / CUP_SWAY_PERIOD_MS) * 2 * Math.PI) * CUP_SWAY_RANGE_X
      : 0;
    const desiredTiltDeg = tiltActive ? computeCupTiltDeg(now + i * CUP_TILT_PHASE_STAGGER_MS, level.paceMultiplier ?? 1) : 0;

    const dxDelta = desiredDx - state.appliedDx;
    const tiltDeltaRad = (desiredTiltDeg - state.tiltDeg) * (Math.PI / 180);
    const walls = cupWallsRef.current.get(t.id);
    if (walls) {
      if (dxDelta !== 0) translateCup(walls, dxDelta, 0);
      if (tiltDeltaRad !== 0) rotateCup(walls, tiltDeltaRad, { x: baseX + desiredDx, y: t.y });
    }

    state.x = baseX + desiredDx;
    state.y = t.y;
    state.tiltDeg = desiredTiltDeg;
    state.appliedDx = desiredDx;
  });
}

/**
 * Picks a new random button offset for Phase 3 Levels 8-9's "jump" behavior, rejecting draws too
 * close to the current position so every jump reads as a real re-aim rather than an imperceptible
 * nudge.
 */
function pickJumpOffset(current: number): number {
  let next = current;
  while (Math.abs(next - current) < BUTTON_RANGE_X * JUMP_MIN_DISTANCE_FRACTION) {
    next = (Math.random() * 2 - 1) * BUTTON_RANGE_X;
  }
  return next;
}

/**
 * Resolves a target's current x/restY (dynamic, from cupMotionRef, when Phase 8's cupMotion is
 * active; otherwise the static level.targets position, byte-identical to every pre-Phase-8 level)
 * and whether it's currently "closed" — tilted past CUP_SETTLE_TILT_LIMIT_DEG, so it can't hold or
 * newly catch a ball this frame. Shared by computeSettledBalls/computeSettledSinkers so both agree
 * on exactly where a cup is right now rather than duplicating the cupMotion lookup.
 */
function resolveCupTarget(
  target: TargetConfig,
  level: LevelConfig,
  width: number,
  cupMotionRef: React.MutableRefObject<Map<string, CupMotionState>> | null
): { targetX: number; restY: number; closed: boolean } {
  const dyn = level.cupMotion ? cupMotionRef?.current.get(target.id) : undefined;
  return {
    targetX: dyn?.x ?? width / 2 + target.dx,
    restY: target.y + (CUP_RADIUS - BALL_RADIUS),
    closed: dyn !== undefined && Math.abs(dyn.tiltDeg) > CUP_SETTLE_TILT_LIMIT_DEG,
  };
}

/**
 * Finds the single ball body currently "settled" in each target — resting near the bottom of the
 * semicircular arc (see createCup's restY), moving slowly. Shared by checkTargets (win condition)
 * and the Phase 2 ball-lifecycle timer (a settled ball is "safe" and stops aging), so both agree
 * on exactly which ball counts as landed rather than duplicating the settle math.
 */
function computeSettledBalls(
  pw: PhysicsWorld,
  level: LevelConfig,
  width: number,
  cupMotionRef: React.MutableRefObject<Map<string, CupMotionState>> | null = null
): Map<string, Matter.Body> {
  const balls = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));
  const result = new Map<string, Matter.Body>();

  for (const target of level.targets as TargetConfig[]) {
    const { targetX, restY, closed } = resolveCupTarget(target, level, width, cupMotionRef);
    if (closed) continue;

    const ball = balls.find((b) => {
      const deltaX = b.position.x - targetX;
      const deltaY = b.position.y - restY;
      const settled = Math.abs(b.velocity.x) < SETTLE_VELOCITY_THRESHOLD && Math.abs(b.velocity.y) < SETTLE_VELOCITY_THRESHOLD;
      return Math.abs(deltaX) < SETTLE_X_TOLERANCE && Math.abs(deltaY) < SETTLE_Y_TOLERANCE && settled;
    });
    if (ball) result.set(target.id, ball);
  }

  return result;
}

/**
 * Phase 5's sinker ball: same settle math as computeSettledBalls, filtered to the 'sinker-'
 * prefix instead of 'ball-'. Kept as its own small function rather than generalizing
 * computeSettledBalls with a filter parameter, to avoid touching the win-condition-critical
 * function that every other mechanic already depends on. Used only for the warning haptic —
 * never for win-condition purposes, since a sinker should never count as filling a cup.
 */
function computeSettledSinkers(
  pw: PhysicsWorld,
  level: LevelConfig,
  width: number,
  cupMotionRef: React.MutableRefObject<Map<string, CupMotionState>> | null = null
): Map<string, Matter.Body> {
  const sinkers = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('sinker-'));
  const result = new Map<string, Matter.Body>();

  for (const target of level.targets as TargetConfig[]) {
    const { targetX, restY, closed } = resolveCupTarget(target, level, width, cupMotionRef);
    if (closed) continue;

    const sinker = sinkers.find((b) => {
      const deltaX = b.position.x - targetX;
      const deltaY = b.position.y - restY;
      const settled = Math.abs(b.velocity.x) < SETTLE_VELOCITY_THRESHOLD && Math.abs(b.velocity.y) < SETTLE_VELOCITY_THRESHOLD;
      return Math.abs(deltaX) < SETTLE_X_TOLERANCE && Math.abs(deltaY) < SETTLE_Y_TOLERANCE && settled;
    });
    if (sinker) result.set(target.id, sinker);
  }

  return result;
}

/**
 * Phase 2's ball-lifecycle mechanic: every floating (non-settled) ball accumulates age each
 * frame; once it reaches ballLifespanMs it sinks (removed from the world, small bubble-burst
 * "splash"). A settled ball's timer pauses, not resets, at its current value, so a ball nudged
 * out of a cup later resumes from where it left off rather than getting a fresh full life.
 * No-op when the level has no ballLifespanMs, so Phase 1 levels are unaffected.
 *
 * When level.ballFizzy is set (Phase 2 Level 3), a ball also shrinks toward FIZZY_MIN_SCALE as
 * its age approaches the lifespan, driven by the same age value — frozen while settled, same as
 * the countdown ring. Matter.Body.scale updates the body's circleRadius directly, so rendering
 * (which reads circleRadius) picks up the shrink automatically with no render-side changes.
 * Body.scale is relative, not absolute, so ballScale tracks each ball's current factor to compute
 * the right per-frame ratio toward the deterministic age-derived target.
 */
function updateBallLifecycle(
  pw: PhysicsWorld,
  level: LevelConfig,
  settledBalls: Map<string, Matter.Body>,
  ballAge: Map<number, number>,
  ballScale: Map<number, number>,
  delta: number
) {
  if (!level.ballLifespanMs) return;

  const settledBallIds = new Set(Array.from(settledBalls.values()).map((b) => b.id));
  const ballBodies = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));
  for (const ball of ballBodies) {
    if (settledBallIds.has(ball.id)) continue;

    const age = (ballAge.get(ball.id) ?? 0) + delta;
    if (age >= level.ballLifespanMs) {
      const { x, y } = ball.position;
      Matter.World.remove(pw.world, ball);
      ballAge.delete(ball.id);
      ballScale.delete(ball.id);
      for (let i = 0; i < 5; i++) spawnBubble(pw.world, x, y);
      continue;
    }

    ballAge.set(ball.id, age);

    if (level.ballFizzy) {
      const targetScale = 1 - (age / level.ballLifespanMs) * (1 - FIZZY_MIN_SCALE);
      const currentScale = ballScale.get(ball.id) ?? 1;
      if (targetScale !== currentScale) {
        const ratio = targetScale / currentScale;
        Matter.Body.scale(ball, ratio, ratio);
        ballScale.set(ball.id, targetScale);
      }
    }
  }
}

/**
 * Phase 2 Levels 2-3's countdown tick: a short beep (see playCountdownTick in utils/audio.ts)
 * that plays on a schedule tied to whichever aging ball is closest to sinking, speeding up as
 * urgency rises. No-ops when the level has no tickAudio, or when every ball is currently settled
 * (safe) — nothing to feel urgent about once everything has landed.
 */
function updateCountdownTick(
  pw: PhysicsWorld,
  level: LevelConfig,
  settledBalls: Map<string, Matter.Body>,
  ballAge: Map<number, number>,
  nextTickAtRef: React.MutableRefObject<number>,
  now: number
) {
  if (!level.tickAudio || !level.ballLifespanMs) return;

  const settledBallIds = new Set(Array.from(settledBalls.values()).map((b) => b.id));
  const ballBodies = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));

  let minFraction = 1;
  for (const ball of ballBodies) {
    if (settledBallIds.has(ball.id)) continue;
    const age = ballAge.get(ball.id) ?? 0;
    const fraction = 1 - age / level.ballLifespanMs;
    if (fraction < minFraction) minFraction = fraction;
  }

  if (minFraction >= 1) return; // nothing currently aging

  if (now >= nextTickAtRef.current) {
    const urgency = 1 - minFraction;
    playCountdownTick(urgency);
    nextTickAtRef.current = now + (TICK_INTERVAL_CALM_MS - urgency * (TICK_INTERVAL_CALM_MS - TICK_INTERVAL_URGENT_MS));
  }
}

/**
 * A target counts as "filled" only while a ball is currently resting in its bowl. Re-evaluated
 * every frame in both directions: a cup un-fills the moment its ball is knocked out or lifted
 * back out by the jet (or, in Phase 2, sinks away after its countdown expires), not just once
 * when a ball first lands.
 *
 * `newlyFilled` lists only the ids that transitioned unfilled->filled *this frame* — Phase 4's
 * combo meter needs a genuine new landing, not "still filled from before", to know a fresh shot
 * was made.
 */
function checkTargets(
  settledBalls: Map<string, Matter.Body>,
  level: LevelConfig,
  filled: Set<string>,
  wonRef: React.MutableRefObject<boolean>,
  onWin: () => void
): { changed: boolean; newlyFilled: string[] } {
  if (wonRef.current) return { changed: false, newlyFilled: [] };

  let changed = false;
  const newlyFilled: string[] = [];

  for (const target of level.targets as TargetConfig[]) {
    const occupied = settledBalls.has(target.id);

    if (occupied && !filled.has(target.id)) {
      filled.add(target.id);
      changed = true;
      newlyFilled.push(target.id);
      hapticLanding();
    } else if (!occupied && filled.has(target.id)) {
      filled.delete(target.id);
      changed = true;
    }
  }

  if (filled.size >= level.targets.length) {
    wonRef.current = true;
    onWin();
  }

  return { changed, newlyFilled };
}

/**
 * Phase 4's chain-match bonus: for each group in level.matchRows, if every cup in the group
 * currently holds a settled ball AND those balls all share the same color, spawn a bonus (see
 * triggerBonus) at the group's middle cup. Each group can only fire once per level instance
 * (tracked via matchedRowsRef) so a match that stays formed doesn't spam bonuses every frame.
 * No-op when the level has no chainMatchBonus/matchRows.
 */
function checkChainMatches(
  level: LevelConfig,
  settledBalls: Map<string, Matter.Body>,
  matchedRowsRef: React.MutableRefObject<Set<string>>,
  width: number,
  onBonus: (x: number, y: number) => void
) {
  if (!level.chainMatchBonus || !level.matchRows) return;

  for (const group of level.matchRows) {
    const key = group.join(',');
    if (matchedRowsRef.current.has(key)) continue;

    const balls = group.map((id) => settledBalls.get(id));
    if (balls.some((b) => !b)) continue;

    const colors = balls.map((b) => b!.label.replace('ball-', ''));
    if (!colors.every((c) => c === colors[0])) continue;

    matchedRowsRef.current.add(key);

    const targets = level.targets as TargetConfig[];
    const middle = targets.find((t) => t.id === group[1]) ?? targets.find((t) => t.id === group[0])!;
    onBonus(width / 2 + middle.dx, middle.y);
  }
}

/**
 * Phase 4's bonus reward, shared by chain matches and the rainbow cup: spawns one extra playable
 * ball at the ramp's low point (same body setup as the initial spawn, via ballBodyOptions, so it
 * behaves identically to a normal ball — a genuinely useful extra chance, not just a visual prop),
 * plays a chime, and bursts a few celebratory bubbles at the match/cup location.
 */
function triggerBonus(pw: PhysicsWorld, level: LevelConfig, x: number, y: number, rampLowX: number, rampLowY: number) {
  const color = level.ballColors[Math.floor(Math.random() * level.ballColors.length)];
  const bonusBall = Matter.Bodies.circle(rampLowX, rampLowY - 24, BALL_RADIUS, ballBodyOptions(color));
  Matter.World.add(pw.world, bonusBall);
  playBonusChime();
  for (let i = 0; i < 4; i++) spawnBubble(pw.world, x, y);
}

/**
 * Phase 6's golden-ball bonus: once (per level instance — tracked via goldenTriggeredRef) a ball
 * whose color is GOLD_COLOR is found settled in any target, auto-fills a random other currently-
 * *empty* target by spawning a new ball body positioned exactly at that target's rest position
 * with zero velocity — the very next frame's normal settle check (computeSettledBalls) picks it
 * up on its own, so no special-cased "instant fill" branch is needed anywhere else. No-op when
 * the level has no goldenCount, when it's already fired, or when there's no empty target left.
 */
function triggerGoldenBonus(
  pw: PhysicsWorld,
  level: LevelConfig,
  settledBalls: Map<string, Matter.Body>,
  filled: Set<string>,
  goldenTriggeredRef: React.MutableRefObject<boolean>,
  width: number
) {
  if (!level.goldenCount || goldenTriggeredRef.current) return;

  const goldenSettled = Array.from(settledBalls.values()).some((b) => b.label === `ball-${GOLD_COLOR}`);
  if (!goldenSettled) return;

  goldenTriggeredRef.current = true;

  const emptyTargets = (level.targets as TargetConfig[]).filter((t) => !filled.has(t.id));
  if (emptyTargets.length === 0) return;

  const target = emptyTargets[Math.floor(Math.random() * emptyTargets.length)];
  const targetX = width / 2 + target.dx;
  const restY = target.y + (CUP_RADIUS - BALL_RADIUS);
  const color = level.ballColors[Math.floor(Math.random() * level.ballColors.length)];
  const autoBall = Matter.Bodies.circle(targetX, restY, BALL_RADIUS, ballBodyOptions(color));
  Matter.Body.setVelocity(autoBall, { x: 0, y: 0 });
  Matter.World.add(pw.world, autoBall);
  playBonusChime();
  for (let i = 0; i < 4; i++) spawnBubble(pw.world, targetX, target.y);
}

/**
 * Phase 4's combo meter: a landing within COMBO_WINDOW_MS of the previous one extends the streak;
 * a longer gap resets it. Decay is checked independently of new landings so the meter visibly
 * drops back to 0 if the player pauses too long, not just when they land again. No-op when the
 * level has no comboMeter.
 */
function updateComboMeter(
  level: LevelConfig,
  newlyFilled: string[],
  comboCountRef: React.MutableRefObject<number>,
  comboLastLandingAtRef: React.MutableRefObject<number>,
  now: number
) {
  if (!level.comboMeter) return;

  if (newlyFilled.length > 0) {
    const withinWindow = now - comboLastLandingAtRef.current <= COMBO_WINDOW_MS;
    comboCountRef.current = withinWindow ? comboCountRef.current + newlyFilled.length : newlyFilled.length;
    comboLastLandingAtRef.current = now;
  } else if (comboCountRef.current > 0 && now - comboLastLandingAtRef.current > COMBO_WINDOW_MS) {
    comboCountRef.current = 0;
  }
}

/**
 * Phase 9 Level 27's finale flourishes: reacts to the SAME newlyFilled landings and comboCountRef
 * that updateComboMeter just updated, rather than re-deriving landing detection. No-op when there
 * was no landing this frame. Plays a combo-pitched note on every landing; fires a brief screen
 * jitter once per newly-crossed multiple of SHAKE_COMBO_STEP (edge-detected via
 * lastShakeThresholdRef, so it fires exactly once at combo 5, once at 10, etc. — not every frame
 * past a threshold).
 */
function triggerFinaleEffects(
  newlyFilled: string[],
  comboCount: number,
  lastShakeThresholdRef: React.MutableRefObject<number>,
  setShakeOffset: (offset: { x: number; y: number }) => void
) {
  if (newlyFilled.length === 0) return;

  playComboNote(comboCount);

  const threshold = Math.floor(comboCount / SHAKE_COMBO_STEP);
  if (threshold > 0 && threshold !== lastShakeThresholdRef.current) {
    lastShakeThresholdRef.current = threshold;
    const jitter = () => (Math.random() * 2 - 1) * SHAKE_MAGNITUDE_PX;
    setShakeOffset({ x: jitter(), y: jitter() });
  }
}

/**
 * Phase 4 Level 12's rainbow bonus cup: cycles a random currently-unfilled target as "active"
 * (rendered with a rainbow ring) for RAINBOW_VISIBLE_MS at a time, RAINBOW_APPEAR_INTERVAL_MS
 * apart. Landing any ball in the active target while it's up triggers a bonus (see triggerBonus)
 * and immediately hides it; otherwise it hides on its own after its window expires. Returns the
 * currently-active target id (or null), for rendering. No-op (always null) when the level has no
 * rainbowCup.
 */
function updateRainbowCup(
  level: LevelConfig,
  now: number,
  settledBalls: Map<string, Matter.Body>,
  rainbowTargetIdRef: React.MutableRefObject<string | null>,
  rainbowNextAtRef: React.MutableRefObject<number>,
  rainbowHideAtRef: React.MutableRefObject<number>,
  width: number,
  onBonus: (x: number, y: number) => void
): string | null {
  if (!level.rainbowCup) return null;

  const targets = level.targets as TargetConfig[];

  if (rainbowTargetIdRef.current === null) {
    if (now >= rainbowNextAtRef.current) {
      const unfilled = targets.filter((t) => !settledBalls.has(t.id));
      const pool = unfilled.length > 0 ? unfilled : targets;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      rainbowTargetIdRef.current = pick.id;
      rainbowHideAtRef.current = now + RAINBOW_VISIBLE_MS;
    }
  } else {
    const activeId = rainbowTargetIdRef.current;
    if (settledBalls.has(activeId)) {
      const target = targets.find((t) => t.id === activeId)!;
      onBonus(width / 2 + target.dx, target.y);
      rainbowTargetIdRef.current = null;
      rainbowNextAtRef.current = now + RAINBOW_APPEAR_INTERVAL_MS;
    } else if (now >= rainbowHideAtRef.current) {
      rainbowTargetIdRef.current = null;
      rainbowNextAtRef.current = now + RAINBOW_APPEAR_INTERVAL_MS;
    }
  }

  return rainbowTargetIdRef.current;
}

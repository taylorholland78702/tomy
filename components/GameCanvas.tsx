import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Dimensions, Pressable, Text, StyleSheet } from 'react-native';
import Matter from 'matter-js';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { Tank } from './Tank';
import { AirJetButton } from './AirJetButton';
import {
  createPhysicsWorld,
  createVRamp,
  createPeg,
  createCup,
  computeRampPoints,
  applyWaterPhysics,
  applyRampGuide,
  applyCupRetention,
  CupAnchor,
  applyAirJet,
  spawnBubble,
  updateBubbles,
  PhysicsWorld,
  WATER_FRICTION_AIR,
  BALL_RADIUS,
  CUP_RADIUS,
} from '../physics/engine';
import { useTiltGravity } from '../hooks/useTiltGravity';
import { LevelConfig, TargetConfig } from '../physics/levels';
import { hapticLanding, hapticLevelComplete } from '../utils/haptics';
import { playCountdownTick } from '../utils/audio';

/**
 * SVG arc for a true semicircle: rim at (x±CUP_RADIUS, y), bulging down to (x, y + CUP_RADIUS).
 * sweep-flag=0 (not 1) is what picks the lower arc here — sweep=1 traces the arc through
 * increasing angle in SVG's y-down space, which passes through the *top* point first, drawing a
 * dome instead of a bowl.
 */
function cupPath(x: number, y: number) {
  return `M ${x - CUP_RADIUS} ${y} A ${CUP_RADIUS} ${CUP_RADIUS} 0 0 0 ${x + CUP_RADIUS} ${y}`;
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

export function GameCanvas({ level, onComplete }: Props) {
  const { width, height } = Dimensions.get('window');
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const jetActiveRef = useRef(false);
  const filledRef = useRef<Set<string>>(new Set());
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
  /** Phase 3's moving-target mechanic: primary button's current x offset from center, px. */
  const buttonOffsetRef = useRef(0);
  /** Level 9's temporary second button: whether it's currently held, and its own x offset. */
  const secondaryActiveRef = useRef(false);
  const secondaryOffsetRef = useRef(0);
  /** Level 9's temporary second button: ms timestamps driving its appear/hide schedule. */
  const twinNextAtRef = useRef(0);
  const twinHideAtRef = useRef(0);
  const twinVisibleRef = useRef(false);
  const [renderBodies, setRenderBodies] = useState<RenderBody[]>([]);
  const [filledIds, setFilledIds] = useState<string[]>([]);
  const [engineVersion, setEngineVersion] = useState(0);
  const [buttonOffsetX, setButtonOffsetX] = useState(0);
  const [twinOffsetX, setTwinOffsetX] = useState<number | null>(null);

  const { needsPermission, requestPermission } = useTiltGravity(physicsRef.current?.engine ?? null);

  const rampBaseY = height - RAMP_OFFSET_FROM_BOTTOM;
  const ramp = computeRampPoints(width, rampBaseY);

  useEffect(() => {
    const pw = createPhysicsWorld(width, height);
    physicsRef.current = pw;
    setEngineVersion((v) => v + 1);
    const rampInfo = createVRamp(pw.world, width, rampBaseY);
    jetXRef.current = rampInfo.lowPoint.x;
    jetYRef.current = rampInfo.lowPoint.y;

    cupAnchorsRef.current = level.targets.map((target) => {
      const cup = createCup(pw.world, width / 2 + target.dx, target.y, target.id);
      return { x: width / 2 + target.dx, restY: cup.restY };
    });

    level.pegs.forEach((peg) => {
      createPeg(pw.world, width / 2 + peg.dx, peg.y);
    });

    // Cluster balls in a small grid above the ramp's low point, like the pooled balls on the
    // real toy, instead of a single spread-out row.
    const cols = Math.min(6, level.ballCount);
    const spacing = BALL_RADIUS * 2 + 4;
    const balls = level.ballColors.slice(0, level.ballCount).map((color, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, level.ballCount - row * cols);
      const rowStartX = rampInfo.lowPoint.x - ((rowCount - 1) * spacing) / 2;
      return Matter.Bodies.circle(rowStartX + col * spacing, rampInfo.lowPoint.y - 24 - row * spacing, BALL_RADIUS, {
        // Higher than before (0.4) so balls bounce apart on contact rather than settling into a
        // clumped pile — low restitution combined with the ramp's constant pull toward its low
        // point made resting balls read as "stuck together".
        restitution: 0.6,
        frictionAir: WATER_FRICTION_AIR,
        // Lighter than matter's circle default (0.001) so the jet's forces — which aren't
        // mass-scaled — push these around more, and low friction so they roll down the ramp
        // instead of sticking to it.
        density: BALL_DENSITY,
        friction: 0.006,
        label: `ball-${color}`,
      });
    });
    Matter.World.add(pw.world, balls);

    filledRef.current = new Set();
    wonRef.current = false;
    ballAgeRef.current = new Map();
    ballScaleRef.current = new Map();
    nextTickAtRef.current = 0;
    buttonOffsetRef.current = 0;
    secondaryActiveRef.current = false;
    secondaryOffsetRef.current = 0;
    twinNextAtRef.current = Date.now() + TWIN_APPEAR_INTERVAL_MS;
    twinHideAtRef.current = 0;
    twinVisibleRef.current = false;
    setButtonOffsetX(0);
    setTwinOffsetX(null);

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

      applyWaterPhysics(Matter.Composite.allBodies(pw.world));
      // Note: the ramp's low point is always the fixed screen-center x (see computeRampPoints),
      // NOT jetXRef — those two only coincided by construction before Phase 3, where the jet
      // origin was permanently parked at the ramp's low point. Now that jetXRef can move with the
      // Air Jet button, the roll-to-center guide must keep targeting the ramp's actual (unmoving)
      // geometry, not wherever the button currently is.
      applyRampGuide(Matter.Composite.allBodies(pw.world), width / 2, rampBaseY, RAMP_GUIDE_STRENGTH);

      const anyJetActive = jetActiveRef.current || secondaryActiveRef.current;
      if (anyJetActive) {
        // Retention only opposes the jet, not general gravity/tilt: gravity forces are
        // mass-scaled and these balls are light, so a retention strength that meaningfully
        // resists the (unscaled) jet is strong enough to make even extreme tilt unable to
        // dislodge a ball at all — defeating "tips the phone a lot" entirely. Gating retention to
        // "jet held" keeps tilt working through plain gravity + the cup's rigid walls, same as
        // if this feature didn't exist, while still protecting against jet disturbance.
        applyCupRetention(Matter.Composite.allBodies(pw.world), cupAnchorsRef.current, CUP_RETENTION_STRENGTH, CUP_RETENTION_RADIUS);
      }
      if (jetActiveRef.current) {
        applyAirJet(
          pw.world,
          jetXRef.current,
          jetYRef.current,
          JET_STRENGTH,
          JET_BASE_COLUMN_HALF_WIDTH,
          JET_VERTICAL_RANGE,
          JET_FAN_RATE,
          JET_SPREAD_STRENGTH
        );
        spawnBubble(pw.world, jetXRef.current, height - 80);
      }
      if (secondaryActiveRef.current) {
        // Level 9's temporary second button: an independent jet at its own x, reusing the exact
        // same shape/strength constants and functions as the primary — applyAirJet already takes
        // an arbitrary origin x, so no physics changes were needed to support a second one.
        const secondaryJetX = width / 2 + secondaryOffsetRef.current;
        applyAirJet(
          pw.world,
          secondaryJetX,
          jetYRef.current,
          JET_STRENGTH,
          JET_BASE_COLUMN_HALF_WIDTH,
          JET_VERTICAL_RANGE,
          JET_FAN_RATE,
          JET_SPREAD_STRENGTH
        );
        spawnBubble(pw.world, secondaryJetX, height - 80);
      }
      updateBubbles(pw.world, 1600);

      Matter.Engine.update(pw.engine, delta);

      const settledBalls = computeSettledBalls(pw, level, width);
      const filledChanged = checkTargets(settledBalls, level, filledRef.current, wonRef, () => {
        hapticLevelComplete();
        setTimeout(onComplete, 1200);
      });
      if (filledChanged) setFilledIds(Array.from(filledRef.current));

      updateBallLifecycle(pw, level, settledBalls, ballAgeRef.current, ballScaleRef.current, delta);
      updateCountdownTick(pw, level, settledBalls, ballAgeRef.current, nextTickAtRef, now);

      setButtonOffsetX(buttonOffsetRef.current);
      setTwinOffsetX(twinVisible ? secondaryOffsetRef.current : null);

      const bodies = Matter.Composite.allBodies(pw.world).filter((b) => !b.isStatic);
      setRenderBodies(
        bodies.map((b) => {
          const isBall = b.label.startsWith('ball-');
          const ringFraction =
            isBall && level.ballLifespanMs
              ? Math.max(0, 1 - (ballAgeRef.current.get(b.id) ?? 0) / level.ballLifespanMs)
              : undefined;
          return {
            id: b.id,
            x: b.position.x,
            y: b.position.y,
            radius: (b as any).circleRadius ?? 10,
            color: isBall ? b.label.replace('ball-', '') : '#EAFBFF',
            isBubble: b.label === 'bubble',
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
      // Phase 3 Levels 8-9: jump to a new spot the instant the button is released, so every
      // press requires a fresh re-aim. Checked against the *previous* value (before overwriting
      // it below) so this only fires on a genuine press->release transition, not every frame.
      if (!active && jetActiveRef.current && (level.buttonMotion === 'jump' || level.buttonMotion === 'twin')) {
        buttonOffsetRef.current = pickJumpOffset(buttonOffsetRef.current);
      }
      jetActiveRef.current = active;
    },
    [level.buttonMotion]
  );

  const handleSecondaryHoldChange = useCallback((active: boolean) => {
    secondaryActiveRef.current = active;
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Tank width={width} height={height} />
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          {Array.from(new Set(level.ballColors)).map((color) => (
            <RadialGradient key={color} id={ballGradientId(color)} cx="35%" cy="30%" r="75%">
              <Stop offset="0%" stopColor={shadeColor(color, 0.55)} />
              <Stop offset="55%" stopColor={color} />
              <Stop offset="100%" stopColor={shadeColor(color, -0.35)} />
            </RadialGradient>
          ))}
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
        {level.targets.map((t) => (
          <Path
            key={t.id}
            d={cupPath(width / 2 + t.dx, t.y)}
            fill={filledIds.includes(t.id) ? 'rgba(255,210,59,0.35)' : 'rgba(255,255,255,0.15)'}
            stroke={filledIds.includes(t.id) ? '#FFD23B' : 'rgba(255,255,255,0.65)'}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ))}
        {renderBodies.map((b) => (
          <React.Fragment key={b.id}>
            <Circle
              cx={b.x}
              cy={b.y}
              r={b.radius}
              fill={b.isBubble ? 'rgba(255,255,255,0.55)' : `url(#${ballGradientId(b.color)})`}
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
      <AirJetButton onHoldChange={handleHoldChange} offsetX={buttonOffsetX} />
      {twinOffsetX !== null && (
        <AirJetButton onHoldChange={handleSecondaryHoldChange} offsetX={twinOffsetX} variant="ghost" />
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
 * Finds the single ball body currently "settled" in each target — resting near the bottom of the
 * semicircular arc (see createCup's restY), moving slowly. Shared by checkTargets (win condition)
 * and the Phase 2 ball-lifecycle timer (a settled ball is "safe" and stops aging), so both agree
 * on exactly which ball counts as landed rather than duplicating the settle math.
 */
function computeSettledBalls(pw: PhysicsWorld, level: LevelConfig, width: number): Map<string, Matter.Body> {
  const balls = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));
  const result = new Map<string, Matter.Body>();

  for (const target of level.targets as TargetConfig[]) {
    const targetX = width / 2 + target.dx;
    const restY = target.y + (CUP_RADIUS - BALL_RADIUS);

    const ball = balls.find((b) => {
      const deltaX = b.position.x - targetX;
      const deltaY = b.position.y - restY;
      const settled = Math.abs(b.velocity.x) < 1.2 && Math.abs(b.velocity.y) < 1.2;
      return Math.abs(deltaX) < CUP_RADIUS * 0.5 && Math.abs(deltaY) < BALL_RADIUS * 0.5 && settled;
    });
    if (ball) result.set(target.id, ball);
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
 */
function checkTargets(
  settledBalls: Map<string, Matter.Body>,
  level: LevelConfig,
  filled: Set<string>,
  wonRef: React.MutableRefObject<boolean>,
  onWin: () => void
): boolean {
  if (wonRef.current) return false;

  let changed = false;

  for (const target of level.targets as TargetConfig[]) {
    const occupied = settledBalls.has(target.id);

    if (occupied && !filled.has(target.id)) {
      filled.add(target.id);
      changed = true;
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

  return changed;
}

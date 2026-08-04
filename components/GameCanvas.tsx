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
  const [renderBodies, setRenderBodies] = useState<RenderBody[]>([]);
  const [filledIds, setFilledIds] = useState<string[]>([]);
  const [engineVersion, setEngineVersion] = useState(0);

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

    let lastTime = Date.now();
    const loop = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      applyWaterPhysics(Matter.Composite.allBodies(pw.world));
      applyRampGuide(Matter.Composite.allBodies(pw.world), jetXRef.current, rampBaseY, RAMP_GUIDE_STRENGTH);

      if (jetActiveRef.current) {
        // Retention only opposes the jet, not general gravity/tilt: gravity forces are
        // mass-scaled and these balls are light, so a retention strength that meaningfully
        // resists the (unscaled) jet is strong enough to make even extreme tilt unable to
        // dislodge a ball at all — defeating "tips the phone a lot" entirely. Gating retention to
        // "jet held" keeps tilt working through plain gravity + the cup's rigid walls, same as
        // if this feature didn't exist, while still protecting against jet disturbance.
        applyCupRetention(Matter.Composite.allBodies(pw.world), cupAnchorsRef.current, CUP_RETENTION_STRENGTH, CUP_RETENTION_RADIUS);
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
      updateBubbles(pw.world, 1600);

      Matter.Engine.update(pw.engine, delta);

      const settledBalls = computeSettledBalls(pw, level, width);
      const filledChanged = checkTargets(settledBalls, level, filledRef.current, wonRef, () => {
        hapticLevelComplete();
        setTimeout(onComplete, 1200);
      });
      if (filledChanged) setFilledIds(Array.from(filledRef.current));

      ageBalls(pw, level, settledBalls, ballAgeRef.current, delta);

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

  const handleHoldChange = useCallback((active: boolean) => {
    jetActiveRef.current = active;
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
      <AirJetButton onHoldChange={handleHoldChange} />
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
    top: 60,
    alignSelf: 'center',
  },
  permissionButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

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
 */
function ageBalls(
  pw: PhysicsWorld,
  level: LevelConfig,
  settledBalls: Map<string, Matter.Body>,
  ballAge: Map<number, number>,
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
      for (let i = 0; i < 5; i++) spawnBubble(pw.world, x, y);
    } else {
      ballAge.set(ball.id, age);
    }
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

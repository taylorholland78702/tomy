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
}

/** Lighter than matter's circle default (0.001) — see the ball body creation below for why. */
const BALL_DENSITY = 0.0005;
const JET_STRENGTH = 0.005;
/** Column width right at the origin — narrow, like a real bubble stream before it disperses. */
const JET_BASE_COLUMN_HALF_WIDTH = 50;
/** How much the column widens per pixel risen — this is the "fan out left and right" as it climbs. */
const JET_FAN_RATE = 0.18;
/**
 * How far above the jet's origin the lift force fades to zero — see applyAirJet in
 * physics/engine.ts. Tuned just under the ~500px distance from the ramp's low point up to the
 * top cup row, so a resting top-row ball gets zero lift (safe from any hold duration) while
 * balls rising from the ramp still reliably reach that height on momentum.
 */
const JET_VERTICAL_RANGE = 490;
/** Tangential force around the jet's mid-height point — the "swirl/convection loop" feel. */
const JET_SWIRL_STRENGTH = 0.0016;
const RAMP_OFFSET_FROM_BOTTOM = 175;
/** How firmly balls near the ramp roll toward its low point — see applyRampGuide in physics/engine.ts. */
const RAMP_GUIDE_STRENGTH = 0.00035;

export function GameCanvas({ level, onComplete }: Props) {
  const { width, height } = Dimensions.get('window');
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const jetActiveRef = useRef(false);
  const filledRef = useRef<Set<string>>(new Set());
  const wonRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const jetXRef = useRef(width / 2);
  const jetYRef = useRef(height);
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

    level.targets.forEach((target) => {
      createCup(pw.world, width / 2 + target.dx, target.y, target.id);
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
        restitution: 0.4,
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

    let lastTime = Date.now();
    const loop = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      applyWaterPhysics(Matter.Composite.allBodies(pw.world));
      applyRampGuide(Matter.Composite.allBodies(pw.world), jetXRef.current, rampBaseY, RAMP_GUIDE_STRENGTH);

      if (jetActiveRef.current) {
        applyAirJet(
          pw.world,
          jetXRef.current,
          jetYRef.current,
          JET_STRENGTH,
          JET_BASE_COLUMN_HALF_WIDTH,
          JET_VERTICAL_RANGE,
          JET_FAN_RATE,
          JET_SWIRL_STRENGTH
        );
        spawnBubble(pw.world, jetXRef.current, height - 80);
      }
      updateBubbles(pw.world, 1600);

      Matter.Engine.update(pw.engine, delta);
      const filledChanged = checkTargets(pw, level, width, filledRef.current, wonRef, () => {
        hapticLevelComplete();
        setTimeout(onComplete, 1200);
      });
      if (filledChanged) setFilledIds(Array.from(filledRef.current));

      const bodies = Matter.Composite.allBodies(pw.world).filter((b) => !b.isStatic);
      setRenderBodies(
        bodies.map((b) => ({
          id: b.id,
          x: b.position.x,
          y: b.position.y,
          radius: (b as any).circleRadius ?? 10,
          color: b.label.startsWith('ball-') ? b.label.replace('ball-', '') : '#EAFBFF',
          isBubble: b.label === 'bubble',
        }))
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
          <Circle
            key={b.id}
            cx={b.x}
            cy={b.y}
            r={b.radius}
            fill={b.isBubble ? 'rgba(255,255,255,0.55)' : `url(#${ballGradientId(b.color)})`}
            opacity={b.isBubble ? 0.6 : 1}
          />
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
 * A target counts as "filled" only while a ball is currently resting in its bowl — near the
 * bottom of the semicircular arc (see createCup's restY), moving slowly. Re-evaluated every
 * frame in both directions: a cup un-fills the moment its ball is knocked out or lifted back
 * out by the jet, not just once when a ball first lands.
 */
function checkTargets(
  pw: PhysicsWorld,
  level: LevelConfig,
  width: number,
  filled: Set<string>,
  wonRef: React.MutableRefObject<boolean>,
  onWin: () => void
): boolean {
  if (wonRef.current) return false;

  const balls = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));
  let changed = false;

  for (const target of level.targets as TargetConfig[]) {
    const targetX = width / 2 + target.dx;
    const restY = target.y + (CUP_RADIUS - BALL_RADIUS);

    const occupied = balls.some((ball) => {
      const deltaX = ball.position.x - targetX;
      const deltaY = ball.position.y - restY;
      const settled = Math.abs(ball.velocity.x) < 1.2 && Math.abs(ball.velocity.y) < 1.2;
      return Math.abs(deltaX) < CUP_RADIUS * 0.5 && Math.abs(deltaY) < BALL_RADIUS * 0.5 && settled;
    });

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

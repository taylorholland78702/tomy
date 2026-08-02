import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Dimensions, Pressable, Text, StyleSheet } from 'react-native';
import Matter from 'matter-js';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Tank } from './Tank';
import { AirJetButton } from './AirJetButton';
import {
  createPhysicsWorld,
  createSupportBar,
  createCup,
  applyWaterPhysics,
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

const JET_STRENGTH = 0.0026;
const JET_COLUMN_HALF_WIDTH = 90;
const SUPPORT_BAR_OFFSET_FROM_BOTTOM = 175;

export function GameCanvas({ level, onComplete }: Props) {
  const { width, height } = Dimensions.get('window');
  const physicsRef = useRef<PhysicsWorld | null>(null);
  const jetActiveRef = useRef(false);
  const filledRef = useRef<Set<string>>(new Set());
  const wonRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const [renderBodies, setRenderBodies] = useState<RenderBody[]>([]);
  const [filledIds, setFilledIds] = useState<string[]>([]);
  const [engineVersion, setEngineVersion] = useState(0);

  const { needsPermission, requestPermission } = useTiltGravity(physicsRef.current?.engine ?? null);

  const barY = height - SUPPORT_BAR_OFFSET_FROM_BOTTOM;

  useEffect(() => {
    const pw = createPhysicsWorld(width, height);
    physicsRef.current = pw;
    setEngineVersion((v) => v + 1);
    createSupportBar(pw.world, width, barY);

    level.targets.forEach((target) => {
      createCup(pw.world, width / 2 + target.dx, target.y, target.id);
    });

    const ballSpacing = Math.min(70, (width - 80) / Math.max(level.ballCount - 1, 1));
    const rowStartX = width / 2 - (ballSpacing * (level.ballCount - 1)) / 2;
    const balls = level.ballColors.slice(0, level.ballCount).map((color, i) =>
      Matter.Bodies.circle(rowStartX + i * ballSpacing, barY - 26, BALL_RADIUS, {
        restitution: 0.4,
        frictionAir: WATER_FRICTION_AIR,
        label: `ball-${color}`,
      })
    );
    Matter.World.add(pw.world, balls);

    filledRef.current = new Set();
    wonRef.current = false;

    let lastTime = Date.now();
    const loop = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      applyWaterPhysics(Matter.Composite.allBodies(pw.world));

      if (jetActiveRef.current) {
        applyAirJet(pw.world, width / 2, JET_STRENGTH, JET_COLUMN_HALF_WIDTH);
        if (Math.random() < 0.45) spawnBubble(pw.world, width / 2, height - 80);
      }
      updateBubbles(pw.world);

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
        <Rect
          x={width * 0.09}
          y={barY - 7}
          width={width * 0.82}
          height={14}
          rx={7}
          fill="rgba(255,255,255,0.35)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={1}
        />
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

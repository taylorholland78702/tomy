import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Dimensions, Pressable, Text, StyleSheet } from 'react-native';
import Matter from 'matter-js';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
} from '../physics/engine';
import { useTiltGravity } from '../hooks/useTiltGravity';
import { LevelConfig, TargetConfig } from '../physics/levels';
import { hapticLanding, hapticLevelComplete } from '../utils/haptics';

/** SVG path for a rounded basket trough matching createCup's geometry (mouth at y, floor at y + radius*0.55). */
function cupPath(x: number, y: number, radius: number) {
  const floorY = y + radius * 0.55;
  return `M ${x - radius} ${y} L ${x - radius * 0.9} ${floorY - 4} Q ${x - radius * 0.9} ${floorY} ${x - radius * 0.6} ${floorY} L ${x + radius * 0.6} ${floorY} Q ${x + radius * 0.9} ${floorY} ${x + radius * 0.9} ${floorY - 4} L ${x + radius} ${y}`;
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
}

const JET_STRENGTH = 0.0026;
const JET_COLUMN_HALF_WIDTH = 90;
const SUPPORT_BAR_OFFSET_FROM_BOTTOM = 130;

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
      createCup(pw.world, target.x, target.y, target.radius, target.id);
    });

    const ballSpacing = Math.min(70, (width - 80) / Math.max(level.ballCount - 1, 1));
    const rowStartX = width / 2 - (ballSpacing * (level.ballCount - 1)) / 2;
    const balls = level.ballColors.slice(0, level.ballCount).map((color, i) =>
      Matter.Bodies.circle(rowStartX + i * ballSpacing, barY - 26, 18, {
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
      const filledChanged = checkTargets(pw, level, filledRef.current, wonRef, () => {
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
            d={cupPath(t.x, t.y, t.radius)}
            fill={filledIds.includes(t.id) ? 'rgba(255,210,59,0.35)' : 'rgba(255,255,255,0.15)'}
            stroke={filledIds.includes(t.id) ? '#FFD23B' : 'rgba(255,255,255,0.65)'}
            strokeWidth={2}
          />
        ))}
        {renderBodies.map((b) => (
          <Circle
            key={b.id}
            cx={b.x}
            cy={b.y}
            r={b.radius}
            fill={b.isBubble ? 'rgba(255,255,255,0.55)' : b.color}
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
 * A target counts as "filled" once a ball is physically resting inside its cup — inside the
 * floor's horizontal span and within a settle band above the floor, moving slowly. The cup's
 * walls (see createCup) are what makes "resting" possible at all; this just detects it.
 */
function checkTargets(
  pw: PhysicsWorld,
  level: LevelConfig,
  filled: Set<string>,
  wonRef: React.MutableRefObject<boolean>,
  onWin: () => void
): boolean {
  if (wonRef.current) return false;

  const balls = Matter.Composite.allBodies(pw.world).filter((b) => b.label.startsWith('ball-'));
  let changed = false;

  for (const target of level.targets as TargetConfig[]) {
    if (filled.has(target.id)) continue;

    // A ball can rest anywhere between the flared mouth and the floor — corners of the rigid
    // wall bodies sometimes catch it above the true floor line — so treat the whole basket
    // interior as "caught", not just the floor.
    const floorY = target.y + target.radius * 0.55;
    const mouthY = target.y - target.radius * 0.3;
    for (const ball of balls) {
      const dx = ball.position.x - target.x;
      const settled = Math.abs(ball.velocity.x) < 1.2 && Math.abs(ball.velocity.y) < 1.2;
      const inBasket = ball.position.y > mouthY && ball.position.y < floorY + target.radius * 0.3;

      if (Math.abs(dx) < target.radius * 0.85 && inBasket && settled) {
        filled.add(target.id);
        changed = true;
        hapticLanding();
        break;
      }
    }
  }

  if (filled.size >= level.targets.length) {
    wonRef.current = true;
    onWin();
  }

  return changed;
}

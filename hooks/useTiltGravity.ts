import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import Matter from 'matter-js';

const GRAVITY_SCALE = 1.1;
const SMOOTHING = 0.15;
const UPDATE_INTERVAL_MS = 16;

/**
 * Maps device tilt (Accelerometer) onto the physics engine's gravity vector, smoothed to avoid
 * jitter. No-ops on web, where expo-sensors has no Accelerometer implementation.
 */
export function useTiltGravity(engine: Matter.Engine | null) {
  const smoothed = useRef({ x: 0, y: 1 });

  useEffect(() => {
    if (!engine || Platform.OS === 'web') return;

    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    const subscription = Accelerometer.addListener(({ x, y }) => {
      const targetX = x * GRAVITY_SCALE;
      const targetY = -y * GRAVITY_SCALE;

      smoothed.current.x += (targetX - smoothed.current.x) * SMOOTHING;
      smoothed.current.y += (targetY - smoothed.current.y) * SMOOTHING;

      engine.gravity.x = smoothed.current.x;
      engine.gravity.y = smoothed.current.y;
      engine.gravity.scale = 0.001;
    });

    return () => subscription.remove();
  }, [engine]);
}

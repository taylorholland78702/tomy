import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import Matter from 'matter-js';

const GRAVITY_SCALE = 1.1;
const SMOOTHING = 0.15;
const UPDATE_INTERVAL_MS = 16;
const EARTH_GRAVITY_MS2 = 9.81;

export interface TiltGravityControls {
  /** True once we know tilt needs an explicit user tap to unlock (iOS Safari's motion-permission gate). */
  needsPermission: boolean;
  /** Call from a tap handler to request motion access. No-op on native/Android where none is needed. */
  requestPermission: () => Promise<void>;
}

function getDeviceMotionEventCtor(): any {
  return typeof window !== 'undefined' ? (window as any).DeviceMotionEvent : undefined;
}

/**
 * Maps device tilt onto the physics engine's gravity vector, smoothed to avoid jitter.
 *
 * On native (iOS/Android) this uses expo-sensors' Accelerometer directly. On web — e.g. opening
 * the deployed build in a phone's browser — expo-sensors has no Accelerometer implementation, so
 * we fall back to the browser's native `devicemotion` event instead. iOS Safari additionally
 * requires `DeviceMotionEvent.requestPermission()` to be called from a real user gesture (a
 * useEffect on mount does NOT count and silently fails), so callers must render a button that
 * calls `requestPermission` when `needsPermission` is true.
 */
export function useTiltGravity(engine: Matter.Engine | null): TiltGravityControls {
  const smoothed = useRef({ x: 0, y: 1 });
  const [needsPermission, setNeedsPermission] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const DeviceMotionEventCtor = getDeviceMotionEventCtor();
    const requiresPermission = typeof DeviceMotionEventCtor?.requestPermission === 'function';
    setNeedsPermission(requiresPermission && !permissionGranted);
  }, [permissionGranted]);

  const requestPermission = useCallback(async () => {
    const DeviceMotionEventCtor = getDeviceMotionEventCtor();
    if (typeof DeviceMotionEventCtor?.requestPermission !== 'function') return;
    try {
      const result = await DeviceMotionEventCtor.requestPermission();
      if (result === 'granted') {
        setPermissionGranted(true);
        setNeedsPermission(false);
      }
    } catch {
      // User denied, or the API rejected outside a user gesture — leave needsPermission as-is.
    }
  }, []);

  useEffect(() => {
    if (!engine) return;

    if (Platform.OS === 'web') {
      const DeviceMotionEventCtor = getDeviceMotionEventCtor();
      const requiresPermission = typeof DeviceMotionEventCtor?.requestPermission === 'function';
      if (requiresPermission && !permissionGranted) return;
      if (typeof window === 'undefined') return;

      const handleMotion = (event: DeviceMotionEvent) => {
        const g = event.accelerationIncludingGravity;
        if (!g || g.x == null || g.y == null) return;

        const targetX = (g.x / EARTH_GRAVITY_MS2) * GRAVITY_SCALE;
        const targetY = -(g.y / EARTH_GRAVITY_MS2) * GRAVITY_SCALE;

        smoothed.current.x += (targetX - smoothed.current.x) * SMOOTHING;
        smoothed.current.y += (targetY - smoothed.current.y) * SMOOTHING;

        engine.gravity.x = smoothed.current.x;
        engine.gravity.y = smoothed.current.y;
        engine.gravity.scale = 0.001;
      };

      window.addEventListener('devicemotion', handleMotion);
      return () => window.removeEventListener('devicemotion', handleMotion);
    }

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
  }, [engine, permissionGranted]);

  return { needsPermission, requestPermission };
}

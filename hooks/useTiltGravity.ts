import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import Matter from 'matter-js';

const GRAVITY_SCALE = 1.1;
const SMOOTHING = 0.15;
const UPDATE_INTERVAL_MS = 16;
const EARTH_GRAVITY_MS2 = 9.81;
/**
 * Below this much in-plane tilt (g), treat the device as flat rather than trusting the raw
 * x/y reading. When a phone lies flat on a table, gravity projects almost entirely onto the
 * device's z-axis — accelerometer x/y read near zero, which used to get applied directly as
 * engine.gravity, i.e. "no downward pull in the screen plane at all". But buoyancy (see
 * BUOYANCY_ACCEL in physics/engine.ts) is a constant upward force independent of tilt, so with
 * zero counteracting gravity every ball floated straight to the top. Falling back to the default
 * resting gravity (0, 1) here instead means "flat" behaves like "not tilted" — balls just stay
 * where they are — and only a deliberate, larger tilt (including flipping top-down) overrides it.
 */
const FLAT_MAGNITUDE_THRESHOLD = 0.15;

/**
 * Module-level, not component state: GameCanvas fully remounts on every level change (see its
 * `key` prop in LevelManager), which would otherwise reset `permissionGranted` to false and
 * force the "Enable Tilt Controls" tap again on every single level even though iOS Safari's
 * underlying motion-permission grant is already in effect for the rest of the page's lifetime.
 */
let sharedPermissionGranted = false;

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
  const [permissionGranted, setPermissionGranted] = useState(sharedPermissionGranted);

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
        sharedPermissionGranted = true;
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

        const gx = g.x / EARTH_GRAVITY_MS2;
        const gy = g.y / EARTH_GRAVITY_MS2;
        const isFlat = Math.hypot(gx, gy) < FLAT_MAGNITUDE_THRESHOLD;
        const targetX = isFlat ? 0 : gx * GRAVITY_SCALE;
        const targetY = isFlat ? 1 : -gy * GRAVITY_SCALE;

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
      const isFlat = Math.hypot(x, y) < FLAT_MAGNITUDE_THRESHOLD;
      const targetX = isFlat ? 0 : x * GRAVITY_SCALE;
      const targetY = isFlat ? 1 : -y * GRAVITY_SCALE;

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

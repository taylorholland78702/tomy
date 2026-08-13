import React, { useRef } from 'react';
import { Pressable, StyleSheet, Animated, PanResponder, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticJetPress, hapticJetHoldTick } from '../utils/haptics';

interface Props {
  onHoldChange: (active: boolean) => void;
  /** Horizontal shift from center, in px — the moving-target mechanic (currently unused by any level). Defaults to centered. */
  offsetX?: number;
  /**
   * 'ghost' styles this as the 'twin' buttonMotion variant's temporary second button (currently
   * unused; a subtle amber ring) so it reads as "act now, this won't stay" next to the permanent
   * primary button.
   */
  variant?: 'primary' | 'ghost';
  /** The chargeable jet mechanic (currently unused): true once a held press has passed the charge threshold — a warm gold ring signals "ready to release for a power burst". */
  charging?: boolean;
  /** The swipe-to-angle mechanic (currently unused): track horizontal drag while held instead of a plain Pressable, so the player can angle a launch. */
  swipeEnabled?: boolean;
  /** The swipe-to-angle mechanic (currently unused): horizontal drag distance from the touch-start point, continuously while held; called with 0 on release so every new press starts straight. */
  onSwipeAngle?: (dx: number) => void;
}

/** The swipe-to-angle mechanic (currently unused): how far a drag can bias the launch, px, before clamping. */
const SWIPE_MAX_OFFSET = 50;

const BUTTON_SIZE = 57;
const SOCKET_SIZE = BUTTON_SIZE + 18;
/**
 * Chosen so the gap between the ramp's low point (baseY = tank height - 175, see
 * RAMP_OFFSET_FROM_BOTTOM in GameCanvas) and the top of the socket equals the gap between the
 * socket's bottom and the screen edge: (175 - SOCKET_SIZE) / 2 = (175 - 75) / 2 = 50 on each side.
 */
const SOCKET_BOTTOM_OFFSET = 50;

/**
 * Single circular Air Jet push button styled like a classic Tomy handheld's white plastic
 * button: a glossy raised dome sitting in a recessed dark socket, pressing down and flattening
 * its shadow when held. Heavy tap on press, soft ticks while held.
 */
export function AirJetButton({
  onHoldChange,
  offsetX = 0,
  variant = 'primary',
  charging = false,
  swipeEnabled = false,
  onSwipeAngle,
}: Props) {
  const pressAnim = useRef(new Animated.Value(0)).current; // 0 = raised, 1 = pressed in
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPress = () => {
    hapticJetPress();
    onHoldChange(true);
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    holdInterval.current = setInterval(hapticJetHoldTick, 180);
  };

  const endPress = () => {
    onHoldChange(false);
    Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true, friction: 4 }).start();
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
    onSwipeAngle?.(0); // every new press starts straight, not wherever the last drag left off
  };

  // Only built/used when swipeEnabled — every other level's button keeps the plain Pressable
  // below untouched, since no level currently sets splitButtons:'swipe'.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => startPress(),
      onPanResponderMove: (_evt, gesture) => {
        const clamped = Math.max(-SWIPE_MAX_OFFSET, Math.min(SWIPE_MAX_OFFSET, gesture.dx));
        onSwipeAngle?.(clamped);
      },
      onPanResponderRelease: () => endPress(),
      onPanResponderTerminate: () => endPress(),
    })
  ).current;

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });

  return (
    <Animated.View
      style={[
        styles.socket,
        variant === 'ghost' && styles.socketGhost,
        charging && styles.socketCharging,
        { transform: [{ translateX: offsetX }] },
      ]}
    >
      <Animated.View style={[styles.buttonWrap, { transform: [{ scale }, { translateY }] }]}>
        {swipeEnabled ? (
          <View {...panResponder.panHandlers}>
            <LinearGradient colors={['#FFFFFF', '#F1F3F5', '#D6DBE0']} locations={[0, 0.6, 1]} style={styles.buttonFace}>
              <Animated.View style={styles.highlight} />
            </LinearGradient>
          </View>
        ) : (
          <Pressable onPressIn={startPress} onPressOut={endPress}>
            <LinearGradient colors={['#FFFFFF', '#F1F3F5', '#D6DBE0']} locations={[0, 0.6, 1]} style={styles.buttonFace}>
              <Animated.View style={styles.highlight} />
            </LinearGradient>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  socket: {
    position: 'absolute',
    bottom: SOCKET_BOTTOM_OFFSET,
    alignSelf: 'center',
    width: SOCKET_SIZE,
    height: SOCKET_SIZE,
    borderRadius: SOCKET_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0px 3px 6px rgba(0,0,0,0.4)',
  },
  socketGhost: {
    borderWidth: 2,
    borderColor: 'rgba(255,210,59,0.75)',
    boxShadow: 'inset 0px 3px 6px rgba(0,0,0,0.4), 0px 0px 12px rgba(255,210,59,0.5)',
  },
  socketCharging: {
    borderWidth: 3,
    borderColor: 'rgba(255,180,40,0.9)',
    boxShadow: 'inset 0px 3px 6px rgba(0,0,0,0.4), 0px 0px 18px rgba(255,180,40,0.75)',
  },
  buttonWrap: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    boxShadow: '0px 6px 8px rgba(0,0,0,0.4)',
  },
  buttonFace: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  highlight: {
    position: 'absolute',
    top: BUTTON_SIZE * 0.14,
    left: BUTTON_SIZE * 0.2,
    width: BUTTON_SIZE * 0.5,
    height: BUTTON_SIZE * 0.26,
    borderRadius: BUTTON_SIZE * 0.25,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
});

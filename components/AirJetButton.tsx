import React, { useRef } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticJetPress, hapticJetHoldTick } from '../utils/haptics';

interface Props {
  onHoldChange: (active: boolean) => void;
  /** Horizontal center of the button, in tank coordinates — lines it up with the ramp's low point. */
  centerX: number;
}

const HOUSING_WIDTH = 108;
const HOUSING_HEIGHT = 150;
const PISTON_WIDTH = 74;
const PISTON_HEIGHT = 118;

/**
 * Air Jet push button styled after a real Waterfuls toy's plunger: a white cylindrical piston
 * (rounded cap, straight shaft, gradient shading for roundness) protruding out of a dark arched
 * tunnel housing, with a visible gap of housing showing around the piston's rounded top. Pressing
 * shoves the piston further down into the tunnel rather than just shrinking a flat disc.
 */
export function AirJetButton({ onHoldChange, centerX }: Props) {
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
  };

  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const scaleY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] });

  return (
    <Animated.View style={[styles.housing, { left: centerX - HOUSING_WIDTH / 2 }]}>
      <Animated.View style={[styles.pistonWrap, { transform: [{ translateY }, { scaleY }] }]}>
        <Pressable onPressIn={startPress} onPressOut={endPress}>
          <LinearGradient colors={['#FFFFFF', '#F2F4F6', '#CBD2D9']} locations={[0, 0.55, 1]} style={styles.pistonFace}>
            <Animated.View style={styles.highlight} />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  housing: {
    position: 'absolute',
    bottom: 30,
    width: HOUSING_WIDTH,
    height: HOUSING_HEIGHT,
    borderTopLeftRadius: HOUSING_WIDTH / 2,
    borderTopRightRadius: HOUSING_WIDTH / 2,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#0A2A3D',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    boxShadow: 'inset 0px 8px 12px rgba(0,0,0,0.55)',
  },
  pistonWrap: {
    width: PISTON_WIDTH,
    height: PISTON_HEIGHT,
    borderTopLeftRadius: PISTON_WIDTH / 2,
    borderTopRightRadius: PISTON_WIDTH / 2,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    boxShadow: '0px 5px 8px rgba(0,0,0,0.4)',
  },
  pistonFace: {
    width: PISTON_WIDTH,
    height: PISTON_HEIGHT,
    borderTopLeftRadius: PISTON_WIDTH / 2,
    borderTopRightRadius: PISTON_WIDTH / 2,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
  },
  highlight: {
    marginTop: PISTON_WIDTH * 0.22,
    width: PISTON_WIDTH * 0.45,
    height: PISTON_WIDTH * 0.22,
    borderRadius: PISTON_WIDTH * 0.22,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});

import React, { useRef } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';
import { hapticJetPress, hapticJetHoldTick } from '../utils/haptics';

interface Props {
  onHoldChange: (active: boolean) => void;
}

/** Single circular Air Jet push button, bottom-center. Heavy tap on press, soft ticks while held. */
export function AirJetButton({ onHoldChange }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPress = () => {
    hapticJetPress();
    onHoldChange(true);
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true }).start();
    holdInterval.current = setInterval(hapticJetHoldTick, 180);
  };

  const endPress = () => {
    onHoldChange(false);
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  };

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable onPressIn={startPress} onPressOut={endPress} style={styles.button}>
        <Animated.View style={styles.buttonInner} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  button: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 12px rgba(59, 255, 224, 0.8)',
  },
  buttonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3BFFE0',
  },
});

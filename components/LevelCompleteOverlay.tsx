import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/** react-native-web doesn't support the native animation driver - avoids a console warning on every mount. */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Props {
  levelName: string;
  /** True only after the last level (12) - shows a different headline/CTA, no auto-advance target. */
  isFinal: boolean;
  onContinue: () => void;
}

const BUTTON_DELAY_MS = 300;

/**
 * Holds the win moment until the player taps Continue, instead of the old fixed-timeout auto-
 * advancing banner. No star reveal - see the "remove stars/scoring" request that stripped that
 * out; this now just fades in a card and, shortly after, a Continue button.
 */
export function LevelCompleteOverlay({ levelName, isFinal, onContinue }: Props) {
  const cardAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    Animated.timing(cardAnim, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }).start();

    const timer = setTimeout(() => {
      setShowButton(true);
      Animated.timing(buttonAnim, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }).start();
    }, BUTTON_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelName]);

  return (
    <View style={styles.backdrop}>
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardAnim,
            transform: [{ scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          },
        ]}
      >
        <Text style={styles.title}>{isFinal ? 'All Phases Complete! \u{1F389}' : `${levelName} Complete!`}</Text>
        {showButton && (
          <Animated.View style={{ opacity: buttonAnim }}>
            <Pressable style={styles.continueButton} onPress={onContinue}>
              <Text style={styles.continueButtonText}>{isFinal ? 'Play Again' : 'Continue'}</Text>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(10,30,45,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: 'center',
    minWidth: 240,
  },
  title: {
    color: 'white',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 22,
  },
  continueButton: {
    backgroundColor: '#FFD23B',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 14,
  },
  continueButtonText: {
    color: '#0A1E2D',
    fontSize: 15,
    fontWeight: '700',
  },
});

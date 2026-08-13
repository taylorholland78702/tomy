import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticStarPop } from '../utils/haptics';
import { playStarChime } from '../utils/audio';

/** react-native-web doesn't support the native animation driver - avoids a console warning on every mount. */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Props {
  levelName: string;
  /** 1-3, per computeStars in GameCanvas.tsx. */
  stars: number;
  /** True only after the last level (27) - shows a different headline/CTA, no auto-advance target. */
  isFinal: boolean;
  onContinue: () => void;
}

/** Gap between each star's pop-in, and how long after the last star the Continue button fades in. */
const STAR_STAGGER_MS = 220;
const CARD_ENTER_DELAY_MS = 260;
const BUTTON_DELAY_AFTER_STARS_MS = 200;

/**
 * Replaces the old auto-advancing banner: the win moment now holds until the player taps
 * Continue, with stars popping in one at a time (haptic + ascending chime per star, see
 * hapticStarPop/playStarChime) instead of the whole rating appearing at once. Per the addictive-
 * ness audit's #2 item - the level-complete moment is the genre's key dopamine beat, worth a
 * deliberate reveal rather than a 1.1s auto-dismiss.
 */
export function LevelCompleteOverlay({ levelName, stars, isFinal, onContinue }: Props) {
  const cardAnim = useRef(new Animated.Value(0)).current;
  const starAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    Animated.timing(cardAnim, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }).start();

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < stars; i++) {
      timers.push(
        setTimeout(() => {
          hapticStarPop();
          playStarChime(i);
          Animated.spring(starAnims[i], { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, friction: 4, tension: 140 }).start();
        }, CARD_ENTER_DELAY_MS + i * STAR_STAGGER_MS)
      );
    }

    timers.push(
      setTimeout(() => {
        setShowButton(true);
        Animated.timing(buttonAnim, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }).start();
      }, CARD_ENTER_DELAY_MS + stars * STAR_STAGGER_MS + BUTTON_DELAY_AFTER_STARS_MS)
    );

    return () => timers.forEach(clearTimeout);
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
        <View style={styles.starRow}>
          {[0, 1, 2].map((i) =>
            i < stars ? (
              <Animated.Text
                key={i}
                style={[
                  styles.star,
                  {
                    opacity: starAnims[i],
                    transform: [{ scale: starAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
                  },
                ]}
              >
                ★
              </Animated.Text>
            ) : (
              <Text key={i} style={[styles.star, styles.starEmpty]}>
                ☆
              </Text>
            )
          )}
        </View>
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
  },
  starRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 22,
    height: 40,
    alignItems: 'center',
  },
  star: {
    color: '#FFD23B',
    fontSize: 36,
  },
  starEmpty: {
    color: 'rgba(255,255,255,0.25)',
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

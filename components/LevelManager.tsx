import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameCanvas } from './GameCanvas';
import { LEVELS } from '../physics/levels';

/** Orchestrates level progression: Phase 1 baskets -> Phase 2 rings -> future phases. */
export function LevelManager() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const level = LEVELS[levelIndex];
  const isLastLevel = levelIndex + 1 >= LEVELS.length;

  const handleComplete = () => {
    if (!isLastLevel) {
      setBanner(`${level.name} complete!`);
      setTimeout(() => {
        setBanner(null);
        setLevelIndex((i) => i + 1);
      }, 1100);
    } else {
      setBanner('All phases complete! \u{1F389}');
    }
  };

  return (
    <View style={styles.root}>
      <GameCanvas key={level.id} level={level} onComplete={handleComplete} />
      <View style={styles.hud}>
        <Text style={styles.hudText}>
          Phase {level.phase} · {level.name}
        </Text>
      </View>
      {banner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
  },
  hudText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.85,
    letterSpacing: 0.5,
  },
  banner: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  bannerText: {
    color: '#FFD23B',
    fontSize: 20,
    fontWeight: '700',
  },
});

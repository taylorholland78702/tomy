import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GameCanvas } from './GameCanvas';
import { LEVELS, PHASES } from '../physics/levels';
import { loadProgress, saveProgress } from '../utils/progress';

function phaseName(phaseId: number): string {
  return PHASES.find((p) => p.id === phaseId)?.name ?? '';
}

/** e.g. starRow(2) -> "★★☆" - a plain-text star row, no new assets/deps needed. */
function starRow(count: number): string {
  return '★'.repeat(count) + '☆'.repeat(3 - count);
}

/** Orchestrates level progression through the flattened LEVELS list, grouped by Phase. */
export function LevelManager() {
  const [levelIndex, setLevelIndex] = useState(() => {
    const saved = loadProgress().levelIndex;
    return saved >= 0 && saved < LEVELS.length ? saved : 0;
  });
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(loadProgress().completedIds));
  const [bestStars, setBestStars] = useState<Record<string, number>>(() => loadProgress().stars);
  const [resetKey, setResetKey] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const level = LEVELS[levelIndex];
  const isLastLevel = levelIndex + 1 >= LEVELS.length;

  const handleComplete = (stars: number) => {
    const nextCompletedIds = new Set(completedIds).add(level.id);
    setCompletedIds(nextCompletedIds);
    const nextBestStars = { ...bestStars, [level.id]: Math.max(bestStars[level.id] ?? 0, stars) };
    setBestStars(nextBestStars);
    saveProgress(levelIndex, Array.from(nextCompletedIds), nextBestStars);
    if (!isLastLevel) {
      setBanner(`${level.name} complete!  ${starRow(stars)}`);
      setTimeout(() => {
        setBanner(null);
        setLevelIndex((i) => i + 1);
      }, 1100);
    } else {
      setBanner('All phases complete! \u{1F389}');
    }
  };

  const handleRestart = () => setResetKey((k) => k + 1);

  const isFirstLevel = levelIndex === 0;
  const jumpTo = (index: number) => {
    if (index < 0 || index >= LEVELS.length) return;
    setBanner(null);
    setLevelIndex(index);
    saveProgress(index, Array.from(completedIds), bestStars);
  };

  return (
    <View style={styles.root}>
      <GameCanvas key={`${level.id}-${resetKey}`} level={level} onComplete={handleComplete} />
      <View style={styles.hud}>
        <Text style={styles.hudPhaseText}>
          Phase {level.phase} · {phaseName(level.phase)}
        </Text>
        <Text style={styles.hudText}>
          Level {level.levelInPhase} · {level.name}
        </Text>
        <Text style={styles.hudChallengeText}>{level.challenge}</Text>
        <View style={styles.navRow}>
          <Pressable
            style={[styles.navButton, isFirstLevel && styles.navButtonDisabled]}
            disabled={isFirstLevel}
            onPress={() => jumpTo(levelIndex - 1)}
          >
            <Text style={styles.navButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.navCounterText}>
            {levelIndex + 1} / {LEVELS.length}
            {completedIds.has(level.id) ? `  ${starRow(bestStars[level.id] ?? 0)}` : ''}
          </Text>
          <Pressable
            style={[styles.navButton, isLastLevel && styles.navButtonDisabled]}
            disabled={isLastLevel}
            onPress={() => jumpTo(levelIndex + 1)}
          >
            <Text style={styles.navButtonText}>›</Text>
          </Pressable>
        </View>
      </View>
      <Pressable style={styles.restartButton} onPress={handleRestart}>
        <Text style={styles.restartButtonText}>Restart</Text>
      </Pressable>
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
    top: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudPhaseText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
    letterSpacing: 0.5,
  },
  hudText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.85,
    letterSpacing: 0.5,
  },
  hudChallengeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.55,
    marginTop: 2,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  navButton: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 16,
  },
  navCounterText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  restartButton: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  restartButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
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

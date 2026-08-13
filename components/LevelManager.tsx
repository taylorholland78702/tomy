import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GameCanvas } from './GameCanvas';
import { LevelCompleteOverlay } from './LevelCompleteOverlay';
import { LEVELS, PHASES } from '../physics/levels';
import { loadProgress, saveProgress } from '../utils/progress';

function phaseName(phaseId: number): string {
  return PHASES.find((p) => p.id === phaseId)?.name ?? '';
}

interface Completion {
  levelName: string;
  isFinal: boolean;
}

/** Orchestrates level progression through the flattened LEVELS list, grouped by Phase. */
export function LevelManager() {
  const [levelIndex, setLevelIndex] = useState(() => {
    const saved = loadProgress().levelIndex;
    return saved >= 0 && saved < LEVELS.length ? saved : 0;
  });
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(loadProgress().completedIds));
  const [resetKey, setResetKey] = useState(0);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const level = LEVELS[levelIndex];
  const isLastLevel = levelIndex + 1 >= LEVELS.length;

  const handleComplete = () => {
    const nextCompletedIds = new Set(completedIds).add(level.id);
    setCompletedIds(nextCompletedIds);
    saveProgress(levelIndex, Array.from(nextCompletedIds));
    setCompletion({ levelName: level.name, isFinal: isLastLevel });
  };

  const handleContinue = () => {
    setCompletion(null);
    if (isLastLevel) {
      setLevelIndex(0);
      saveProgress(0, Array.from(completedIds));
    } else {
      setLevelIndex((i) => i + 1);
    }
  };

  const handleRestart = () => setResetKey((k) => k + 1);

  /** Fires when a level's shared countdown clock (see LevelConfig.levelTimerMs) hits zero before
   * the level is won - same effect as tapping the Restart button, no fail-state UI of its own. */
  const handleTimeout = () => handleRestart();

  const isFirstLevel = levelIndex === 0;
  const jumpTo = (index: number) => {
    if (index < 0 || index >= LEVELS.length) return;
    setCompletion(null);
    setLevelIndex(index);
    saveProgress(index, Array.from(completedIds));
  };

  return (
    <View style={styles.root}>
      <GameCanvas
        key={`${level.id}-${resetKey}`}
        level={level}
        onComplete={handleComplete}
        onTimeout={handleTimeout}
      />
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
            {completedIds.has(level.id) ? ' ✓' : ''}
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
      {completion && (
        <LevelCompleteOverlay levelName={completion.levelName} isFinal={completion.isFinal} onContinue={handleContinue} />
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
});

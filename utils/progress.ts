// Bumped to v2 when Phases 3-7 were removed and the remaining phases/levels renumbered — a v1
// levelIndex/completedIds would now point at different levels than the ones a returning player
// actually completed, so the old save is deliberately discarded rather than silently misapplied.
const STORAGE_KEY = 'waterful-toys-progress-v2';

interface Progress {
  levelIndex: number;
  completedIds: string[];
}

const EMPTY_PROGRESS: Progress = { levelIndex: 0, completedIds: [] };

/** Web-only, like utils/audio.ts's Web Audio API split - localStorage has no native fallback here. */
export function loadProgress(): Progress {
  if (typeof window === 'undefined' || !window.localStorage) return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw);
    return {
      levelIndex: typeof parsed.levelIndex === 'number' ? parsed.levelIndex : 0,
      completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(levelIndex: number, completedIds: string[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ levelIndex, completedIds }));
}

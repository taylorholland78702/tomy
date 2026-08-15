// Bumped to v3 when Phase 3 (Full Tilt) was removed and the finale renumbered down to Levels
// 7-9 — same reasoning as the v1->v2 bump: a stale levelIndex/completedIds would now point at
// different levels than the ones a returning player actually completed, so the old save is
// deliberately discarded rather than silently misapplied.
const STORAGE_KEY = 'waterful-toys-progress-v3';

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

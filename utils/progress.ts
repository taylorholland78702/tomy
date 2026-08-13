const STORAGE_KEY = 'waterful-toys-progress-v1';

interface Progress {
  levelIndex: number;
  completedIds: string[];
  /** Best 1-3 star rating earned per level id (see computeStars in GameCanvas.tsx). */
  stars: Record<string, number>;
}

const EMPTY_PROGRESS: Progress = { levelIndex: 0, completedIds: [], stars: {} };

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
      stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(levelIndex: number, completedIds: string[], stars: Record<string, number>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ levelIndex, completedIds, stars }));
}

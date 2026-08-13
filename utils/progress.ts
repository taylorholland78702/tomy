const STORAGE_KEY = 'waterful-toys-progress-v1';

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

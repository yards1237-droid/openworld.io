export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  time: number;
  date: number;
}

const KEY = "neon-outlaw-scores-v1";
const NAME_KEY = "neon-outlaw-name";

export function getScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(list: ScoreEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "ACE";
  } catch {
    return "ACE";
  }
}

export function addScore(score: number, time: number): { id: string; rank: number; list: ScoreEntry[] } {
  const list = getScores();
  const entry: ScoreEntry = {
    id: Math.random().toString(36).slice(2),
    name: getName(),
    score,
    time,
    date: Date.now(),
  };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 8);
  save(trimmed);
  return { id: entry.id, rank: trimmed.findIndex((e) => e.id === entry.id), list: trimmed };
}

export function renameScore(id: string, name: string): ScoreEntry[] {
  const clean = name.replace(/[^\w \-!.]/g, "").slice(0, 10).toUpperCase() || "ACE";
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* ignore */
  }
  const list = getScores().map((e) => (e.id === id ? { ...e, name: clean } : e));
  save(list);
  return list;
}

export function bestScore(): number {
  const l = getScores();
  return l.length ? l[0].score : 0;
}

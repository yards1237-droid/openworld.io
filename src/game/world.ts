// Procedural, infinite city grid. Roads at multiples of CELL, blocks in between.
export const TAU = Math.PI * 2;
export const CELL = 420;
export const ROAD = 124;
export const SIDE = 16;
export const LANE = 30;
export const BLOCK = CELL - ROAD;
export const AREA = BLOCK - SIDE * 2;

export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const roadCenter = (i: number) => i * CELL + ROAD / 2;
export const inRoadBand = (v: number) => mod(v, CELL) < ROAD;

export function hash(i: number, j: number, s = 0): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const WALLS = [
  [14, 18, 40],
  [26, 16, 46],
  [14, 28, 48],
  [32, 18, 40],
  [16, 30, 42],
  [36, 22, 48],
];
const ROOFS = [
  [52, 62, 108],
  [76, 56, 120],
  [44, 82, 122],
  [88, 54, 100],
  [52, 84, 106],
  [96, 64, 118],
];
export const ACCENTS = ["#ff2d95", "#00e5ff", "#ffd400", "#7cff4a", "#b36bff", "#ff6a2d"];

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  height: number;
  layers: string[];
  accent: string;
  sign: number;
  seed: number;
}
export interface Tree {
  x: number;
  y: number;
  r: number;
}
export interface Block {
  i: number;
  j: number;
  x: number;
  y: number;
  park: boolean;
  buildings: Building[];
  trees: Tree[];
}

const cache = new Map<number, Block>();

function mix(a: number[], b: number[], t: number) {
  return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
}

function makeBlock(i: number, j: number): Block {
  const x = i * CELL + ROAD;
  const y = j * CELL + ROAD;
  const ax = x + SIDE;
  const ay = y + SIDE;
  const blk: Block = { i, j, x, y, park: false, buildings: [], trees: [] };
  const near = Math.abs(i) <= 1 && Math.abs(j) <= 1;
  if (!near && hash(i, j, 1) < 0.16) {
    blk.park = true;
    const n = 7 + ((hash(i, j, 9) * 6) | 0);
    for (let k = 0; k < n; k++) {
      blk.trees.push({
        x: ax + 18 + hash(i, j, 20 + k) * (AREA - 36),
        y: ay + 18 + hash(i, j, 60 + k) * (AREA - 36),
        r: 12 + hash(i, j, 100 + k) * 12,
      });
    }
    return blk;
  }
  const layout = hash(i, j, 2);
  const s = 0.36 + hash(i, j, 3) * 0.28;
  let seed = 0;
  const add = (lx: number, ly: number, w: number, h: number) => {
    seed++;
    const r = hash(i, j, 200 + seed);
    const area = (w * h) / (AREA * AREA);
    const height = 34 + r * 70 + (1 - area) * 0 + area * 50 + (hash(i, j, 300 + seed) > 0.8 ? 60 : 0);
    const ci = (hash(i, j, 400 + seed) * WALLS.length) | 0;
    const layers: string[] = [];
    for (let k = 1; k <= 4; k++) layers.push(mix(WALLS[ci], ROOFS[ci], Math.pow(k / 4, 1.8)));
    blk.buildings.push({
      x: lx,
      y: ly,
      w,
      h,
      cx: lx + w / 2,
      cy: ly + h / 2,
      height,
      layers,
      accent: ACCENTS[(hash(i, j, 500 + seed) * ACCENTS.length) | 0],
      sign: hash(i, j, 600 + seed) < 0.55 ? 1 + ((hash(i, j, 700 + seed) * 4) | 0) : 0,
      seed: hash(i, j, 800 + seed),
    });
  };
  if (layout < 0.2) add(ax, ay, AREA, AREA);
  else if (layout < 0.5) {
    const w1 = AREA * s;
    add(ax, ay, w1, AREA);
    add(ax + w1, ay, AREA - w1, AREA);
  } else if (layout < 0.75) {
    const h1 = AREA * s;
    add(ax, ay, AREA, h1);
    add(ax, ay + h1, AREA, AREA - h1);
  } else {
    const w1 = AREA * s;
    const h1 = AREA * (1 - s);
    add(ax, ay, w1, h1);
    add(ax + w1, ay, AREA - w1, h1 * 0.9);
    add(ax, ay + h1, w1 * 1.1, AREA - h1);
    add(ax + w1 * 1.1, ay + h1 * 0.9, AREA - w1 * 1.1, AREA - h1 * 0.9);
  }
  return blk;
}

export function getBlock(i: number, j: number): Block {
  const key = (i + 32768) * 65536 + (j + 32768);
  let b = cache.get(key);
  if (!b) {
    if (cache.size > 900) cache.clear();
    b = makeBlock(i, j);
    cache.set(key, b);
  }
  return b;
}

export interface Hit {
  nx: number;
  ny: number;
  pen: number;
  px: number;
  py: number;
}
const scratch: Hit = { nx: 0, ny: 0, pen: 0, px: 0, py: 0 };

/** Circle vs. buildings. Fills `out` with the deepest penetration. */
export function circleVsBuildings(x: number, y: number, r: number, out: Hit = scratch): boolean {
  let best = 0;
  const i0 = Math.floor((x - r - ROAD) / CELL);
  const i1 = Math.floor((x + r - ROAD) / CELL);
  const j0 = Math.floor((y - r - ROAD) / CELL);
  const j1 = Math.floor((y + r - ROAD) / CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const b = getBlock(i, j);
      if (b.park) continue;
      for (let k = 0; k < b.buildings.length; k++) {
        const bd = b.buildings[k];
        if (x + r < bd.x || x - r > bd.x + bd.w || y + r < bd.y || y - r > bd.y + bd.h) continue;
        const cx = clamp(x, bd.x, bd.x + bd.w);
        const cy = clamp(y, bd.y, bd.y + bd.h);
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let pen: number, nx: number, ny: number;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pen = r - d;
          nx = dx / d;
          ny = dy / d;
        } else {
          const l = x - bd.x;
          const rr = bd.x + bd.w - x;
          const t = y - bd.y;
          const bt = bd.y + bd.h - y;
          const m = Math.min(l, rr, t, bt);
          if (m === l) {
            nx = -1;
            ny = 0;
            pen = l + r;
          } else if (m === rr) {
            nx = 1;
            ny = 0;
            pen = rr + r;
          } else if (m === t) {
            nx = 0;
            ny = -1;
            pen = t + r;
          } else {
            nx = 0;
            ny = 1;
            pen = bt + r;
          }
        }
        if (pen > best) {
          best = pen;
          out.nx = nx;
          out.ny = ny;
          out.pen = pen;
          out.px = cx;
          out.py = cy;
        }
      }
    }
  }
  return best > 0;
}

export function pointInBuilding(x: number, y: number): boolean {
  const i = Math.floor((x - ROAD) / CELL);
  const j = Math.floor((y - ROAD) / CELL);
  const b = getBlock(i, j);
  if (b.park) return false;
  for (let k = 0; k < b.buildings.length; k++) {
    const bd = b.buildings[k];
    if (x >= bd.x && x <= bd.x + bd.w && y >= bd.y && y <= bd.y + bd.h) return true;
  }
  return false;
}

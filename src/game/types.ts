export type Phase = "menu" | "playing" | "paused" | "over";
export type Ctrl = "ai" | "player" | "cop" | "free" | "wreck";

export interface Model {
  name: string;
  len: number;
  wid: number;
  mass: number;
  acc: number;
  maxSpd: number;
  brake: number;
  turn: number;
  hp: number;
}

export const M_SEDAN = 0;
export const M_SPORT = 1;
export const M_VAN = 2;
export const M_COP = 3;
export const M_TAXI = 4;

export const MODELS: Model[] = [
  { name: "SEDAN", len: 42, wid: 21, mass: 1, acc: 300, maxSpd: 240, brake: 700, turn: 2.5, hp: 100 },
  { name: "SPORT", len: 44, wid: 20, mass: 0.9, acc: 440, maxSpd: 340, brake: 820, turn: 2.9, hp: 100 },
  { name: "VAN", len: 56, wid: 25, mass: 1.9, acc: 230, maxSpd: 205, brake: 560, turn: 2.0, hp: 150 },
  { name: "INTERCEPTOR", len: 45, wid: 21, mass: 1.1, acc: 410, maxSpd: 315, brake: 820, turn: 2.8, hp: 110 },
  { name: "TAXI", len: 44, wid: 21, mass: 1, acc: 310, maxSpd: 250, brake: 700, turn: 2.5, hp: 100 },
];

export interface Vehicle {
  id: number;
  model: number;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  av: number;
  ctrl: Ctrl;
  color: string;
  hp: number;
  maxHp: number;
  dir: number;
  cruise: number;
  sp: number;
  turnDir: number;
  turnVal: number;
  lastInter: number;
  hitT: number;
  driver: boolean;
  stuckT: number;
  reverseT: number;
  steer: number;
  braking: boolean;
  drifting: boolean;
  boosting: boolean;
  smokeT: number;
  age: number;
  nm: boolean;
  dead: boolean;
  deadT: number;
  flashT: number;
  yieldT: number;
}

export interface Ped {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  state: number; // 0 walk, 1 flee, 2 fly
  t: number;
  turnT: number;
  spin: number;
  z: number;
  vz: number;
  color: string;
  speed: number;
  byPlayer: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number; // 0 cash 1 repair 2 nitro
  t: number;
}

export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: number; // 0 spark 1 smoke 2 glow 3 chip 4 ring
  rot: number;
  vr: number;
  add: boolean;
  drag: number;
  grow: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  max: number;
  size: number;
}

export interface Skid {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
}

export interface Result {
  score: number;
  reason: string;
  time: number;
  knocked: number;
  wrecked: number;
  jobs: number;
  bestCombo: number;
  topSpeed: number;
  rank: number;
  id: string;
  list: { id: string; name: string; score: number; time: number; date: number }[];
}

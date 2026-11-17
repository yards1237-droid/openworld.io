import {
  CELL,
  LANE,
  ROAD,
  SIDE,
  TAU,
  circleVsBuildings,
  clamp,
  inRoadBand,
  mod,
  pointInBuilding,
  roadCenter,
  type Hit,
} from "./world";
import { sfx } from "./audio";
import { addScore, bestScore } from "./storage";
import {
  MODELS,
  M_COP,
  M_SEDAN,
  M_SPORT,
  M_TAXI,
  M_VAN,
  type Part,
  type Ped,
  type Phase,
  type Pickup,
  type Popup,
  type Result,
  type Skid,
  type Vehicle,
} from "./types";
import { render } from "./render";

export const DIR_A = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const CAR_COLORS = ["#e6e8f2", "#3b5bdb", "#2fbf71", "#f08c00", "#9c36b5", "#868e96", "#e03131", "#15aabf", "#f5f0a0"];
const PED_COLORS = ["#ff6ad5", "#00e5ff", "#ffd400", "#c0ff4a", "#ff8a3d", "#b388ff", "#ffffff", "#ff5d5d"];
const COPS = [0, 1, 3, 4, 6, 8];
export const PLAYER_COLOR = "#ff2d95";

const wrap = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  hp: number;
  veh: Vehicle | null;
  walk: number;
  hurtCool: number;
}

let VID = 1;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 800;
  H = 600;
  dpr = 1;
  scale = 1;
  phase: Phase = "menu";
  onPhase: (p: Phase, r?: Result) => void = () => {};

  // input
  keys: Record<string, boolean> = {};
  stick = { on: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0 };
  btn = { nitro: false, brake: false };
  actionQ = false;
  touchMode = false;
  steerS = 0;
  lastOverAt = 0;

  // world
  vehicles: Vehicle[] = [];
  peds: Ped[] = [];
  pickups: Pickup[] = [];
  parts: Part[] = [];
  popups: Popup[] = [];
  skids: Skid[] = [];
  pool: Part[] = [];
  P: Player = { x: 0, y: 0, vx: 0, vy: 0, a: 0, hp: 100, veh: null, walk: 0, hurtCool: 0 };
  pv: Vehicle | null = null;
  nearVeh: Vehicle | null = null;
  cam = { x: 0, y: 0, zoom: 1 };
  trauma = 0;
  hitStop = 0;
  flash = 0;
  flashColor = "#fff";
  hurt = 0;
  punch = 0;
  time = 0;
  simT = 0;
  banner: Banner | null = null;

  // game state
  score = 0;
  scoreBump = 0;
  combo = 0;
  comboT = 0;
  mult = 1;
  heat = 0;
  evadeT = 0;
  bust = 0;
  nitro = 100;
  job: { x: number; y: number; t: number; limit: number } | null = null;
  best = 0;
  stats = { knocked: 0, wrecked: 0, jobs: 0, bestCombo: 0, topSpeed: 0 };
  scripted = false;
  copCool = 0;
  smashCool = 0;
  sfxCool = 0;
  coinStreak = 0;
  coinT = 0;
  driftT = 0;
  hintT = 0;
  lastHeatStar = 0;
  burning = false;

  private dtNow = 1 / 60;
  private last = 0;
  private raf = 0;
  private hit: Hit = { nx: 0, ny: 0, pen: 0, px: 0, py: 0 };
  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.best = bestScore();
    this.touchMode = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    this.bindInput();
    this.resize();
    this.reset(false);
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000 || 0.016);
      this.last = t;
      this.update(dt);
      render(this);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame((t) => {
      this.last = t;
      loop(t);
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
  }

  /* ---------------------------------------------------------------- input */
  private bindInput() {
    const on = <K extends keyof WindowEventMap>(t: Window, e: K, f: (ev: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(e, f as EventListener, o);
      this.disposers.push(() => t.removeEventListener(e, f as EventListener));
    };
    on(window, "keydown", (e) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA")) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.repeat) {
        this.keys[e.code] = true;
        return;
      }
      this.keys[e.code] = true;
      this.touchMode = false;
      switch (e.code) {
        case "KeyP":
        case "Escape":
          this.togglePause();
          break;
        case "KeyR":
          if (this.phase !== "menu") this.start();
          break;
        case "Enter":
        case "Space":
          if (this.phase === "menu") this.start();
          else if (this.phase === "paused" && e.code === "Enter") this.togglePause();
          else if (this.phase === "over" && performance.now() - this.lastOverAt > 450) this.start();
          break;
        case "KeyM":
          sfx.setMuted(!sfx.muted);
          break;
        case "KeyE":
        case "KeyF":
          this.actionQ = true;
          break;
      }
    });
    on(window, "keyup", (e) => {
      this.keys[e.code] = false;
    });
    on(window, "blur", () => {
      this.keys = {};
      this.btn.nitro = false;
      this.btn.brake = false;
      if (this.phase === "playing") this.togglePause();
    });
    const vis = () => {
      if (document.hidden && this.phase === "playing") this.togglePause();
    };
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", vis));

    const c = this.canvas;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      this.touchMode = true;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (this.stick.on || x > this.W * 0.62) return;
      c.setPointerCapture?.(e.pointerId);
      this.stick = { on: true, id: e.pointerId, ox: x, oy: y, px: x, py: y, x: 0, y: 0 };
    };
    const move = (e: PointerEvent) => {
      const s = this.stick;
      if (!s.on || e.pointerId !== s.id) return;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const R = 58;
      let dx = x - s.ox;
      let dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // drag the base along so the thumb never leaves the stick
        s.ox += (dx / d) * (d - R);
        s.oy += (dy / d) * (d - R);
        dx = x - s.ox;
        dy = y - s.oy;
      }
      s.px = x;
      s.py = y;
      s.x = clamp(dx / R, -1, 1);
      s.y = clamp(dy / R, -1, 1);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.stick.id) this.stick = { on: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0 };
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    this.disposers.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    });
    const rs = () => this.resize();
    window.addEventListener("resize", rs);
    this.disposers.push(() => window.removeEventListener("resize", rs));
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, r.width || window.innerWidth);
    this.H = Math.max(200, r.height || window.innerHeight);
    const coarse = this.touchMode;
    this.dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.scale = Math.max(0.55, Math.sqrt(this.W * this.H) / 950);
  }

  visR() {
    return Math.hypot(this.W, this.H) / 2 / (this.scale * 0.72);
  }

  /* ----------------------------------------------------------- phase API */
  start() {
    sfx.init();
    sfx.ui();
    this.reset(true);
    this.phase = "playing";
    this.onPhase("playing");
  }
  toMenu() {
    this.reset(false);
    this.phase = "menu";
    this.onPhase("menu");
  }
  togglePause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      sfx.engine(0, false, false);
      sfx.siren(0);
      this.stick = { on: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0 };
      this.onPhase("paused");
    } else if (this.phase === "paused") {
      this.phase = "playing";
      this.onPhase("playing");
    }
  }
  press(name: "action") {
    if (name === "action") this.actionQ = true;
  }

  /* ---------------------------------------------------------------- reset */
  newVehicle(model: number, x: number, y: number, a: number, ctrl: Vehicle["ctrl"], color: string, dir = 0): Vehicle {
    const m = MODELS[model];
    return {
      id: VID++,
      model,
      x,
      y,
      a,
      vx: 0,
      vy: 0,
      av: 0,
      ctrl,
      color,
      hp: m.hp,
      maxHp: m.hp,
      dir,
      cruise: rnd(80, 125),
      sp: 0,
      turnDir: -1,
      turnVal: 0,
      lastInter: -1,
      hitT: 99,
      driver: ctrl !== "free",
      stuckT: 0,
      reverseT: 0,
      steer: 0,
      braking: false,
      drifting: false,
      boosting: false,
      smokeT: 0,
      age: 0,
      nm: false,
      dead: false,
      deadT: 0,
      flashT: 0,
      yieldT: 0,
    };
  }

  reset(play: boolean) {
    this.vehicles = [];
    this.peds = [];
    this.pickups = [];
    this.parts = [];
    this.popups = [];
    this.skids = [];
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.heat = 0;
    this.evadeT = 0;
    this.bust = 0;
    this.nitro = 100;
    this.job = null;
    this.banner = null;
    this.trauma = 0;
    this.hitStop = 0;
    this.flash = 0;
    this.hurt = 0;
    this.punch = 0;
    this.simT = 0;
    this.scripted = false;
    this.copCool = 0.5;
    this.hintT = 0;
    this.burning = false;
    this.stats = { knocked: 0, wrecked: 0, jobs: 0, bestCombo: 0, topSpeed: 0 };
    this.best = bestScore();
    this.steerS = 0;
    const sx = roadCenter(0) - LANE;
    const car = this.newVehicle(M_SPORT, sx, -250, Math.PI / 2, play ? "player" : "ai", PLAYER_COLOR, 1);
    car.cruise = 130;
    car.vy = 150;
    car.sp = 130;
    car.hitT = 99;
    this.vehicles.push(car);
    this.pv = car;
    this.P = { x: car.x, y: car.y, vx: 0, vy: 0, a: car.a, hp: 100, veh: car, walk: 0, hurtCool: 0 };
    this.cam.x = car.x;
    this.cam.y = car.y + 120;
    this.cam.zoom = 1;
    for (let i = 0; i < 80; i++) if (this.vehicles.length < 40) this.spawnTraffic(true);
    for (let i = 0; i < 64; i++) this.spawnPed(true);
    // opening coin trail right in front of the player
    for (let k = 0; k < 9; k++) this.pickups.push({ x: sx, y: -120 + k * 52, vx: 0, vy: 0, kind: 0, t: k * 0.1 });
    this.pickups.push({ x: sx, y: 520, vx: 0, vy: 0, kind: 2, t: 0 });
    for (let i = 0; i < 4; i++) this.spawnTrail();
    if (play) {
      this.job = { x: roadCenter(1), y: roadCenter(2), t: 60, limit: 60 };
      this.hintT = 14;
      this.banner = { text: "GO GO GO", sub: "GRAB CASH · WRECK TRAFFIC · REACH THE MARKER", color: "#00e5ff", t: 0 };
    }
  }

  /* ---------------------------------------------------------------- spawn */
  private snapRoad(d: number): { x: number; y: number; dir: number } | null {
    const ang = Math.random() * TAU;
    const px = this.cam.x + Math.cos(ang) * d;
    const py = this.cam.y + Math.sin(ang) * d;
    if (Math.random() < 0.5) {
      const j = Math.round((py - ROAD / 2) / CELL);
      const dir = Math.random() < 0.5 ? 0 : 2;
      let x = px;
      if (inRoadBand(x)) x += ROAD + 12;
      return { x, y: roadCenter(j) + Math.cos(DIR_A[dir]) * LANE, dir };
    }
    const i = Math.round((px - ROAD / 2) / CELL);
    const dir = Math.random() < 0.5 ? 1 : 3;
    let y = py;
    if (inRoadBand(y)) y += ROAD + 12;
    return { x: roadCenter(i) - Math.sin(DIR_A[dir]) * LANE, y, dir };
  }

  spawnTraffic(initial = false): boolean {
    const R = this.visR();
    const d = initial ? rnd(180, R + 300) : rnd(R + 20, R + 300);
    const s = this.snapRoad(d);
    if (!s) return false;
    if (initial && Math.hypot(s.x - this.cam.x, s.y - this.cam.y - 120) < 140) return false;
    for (const o of this.vehicles) if (Math.abs(o.x - s.x) < 80 && Math.abs(o.y - s.y) < 80) return false;
    const r = Math.random();
    const model = r < 0.55 ? M_SEDAN : r < 0.75 ? M_TAXI : r < 0.9 ? M_VAN : M_SPORT;
    const color = model === M_TAXI ? "#ffcc00" : model === M_VAN ? "#d0d4e4" : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
    const v = this.newVehicle(model, s.x, s.y, DIR_A[s.dir], "ai", color, s.dir);
    v.sp = v.cruise;
    this.vehicles.push(v);
    return true;
  }

  spawnPed(initial = false) {
    const R = this.visR();
    const d = initial ? rnd(90, R + 250) : rnd(R + 20, R + 250);
    const ang = Math.random() * TAU;
    const px = this.cam.x + Math.cos(ang) * d;
    const py = this.cam.y + Math.sin(ang) * d;
    let x: number, y: number;
    const side = Math.random() < 0.5 ? -SIDE / 2 : ROAD + SIDE / 2;
    if (Math.random() < 0.5) {
      const j = Math.round((py - ROAD) / CELL);
      y = j * CELL + side;
      x = px;
    } else {
      const i = Math.round((px - ROAD) / CELL);
      x = i * CELL + side;
      y = py;
    }
    if (pointInBuilding(x, y)) return;
    const a = Math.random() * TAU;
    this.peds.push({
      x,
      y,
      vx: 0,
      vy: 0,
      a,
      state: 0,
      t: 0,
      turnT: rnd(1, 4),
      spin: 0,
      z: 0,
      vz: 0,
      color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0],
      speed: rnd(26, 46),
      byPlayer: false,
    });
  }

  spawnTrail() {
    const R = this.visR();
    const s = this.snapRoad(rnd(R * 0.8, R + 300));
    if (!s) return;
    const A = DIR_A[s.dir];
    const kind = Math.random() < 0.1 ? 1 : Math.random() < 0.12 ? 2 : 0;
    const n = kind === 0 ? 5 : 1;
    for (let k = 0; k < n; k++) {
      this.pickups.push({ x: s.x + Math.cos(A) * k * 50, y: s.y + Math.sin(A) * k * 50, vx: 0, vy: 0, kind, t: Math.random() });
    }
  }

  pickJob() {
    const ix = Math.round((this.P.x - ROAD / 2) / CELL);
    const iy = Math.round((this.P.y - ROAD / 2) / CELL);
    for (let tries = 0; tries < 30; tries++) {
      const dx = ((Math.random() * 9) | 0) - 4;
      const dy = ((Math.random() * 9) | 0) - 4;
      const m = Math.abs(dx) + Math.abs(dy);
      if (m < 3 || m > 6) continue;
      const x = roadCenter(ix + dx);
      const y = roadCenter(iy + dy);
      const dist = Math.hypot(x - this.P.x, y - this.P.y);
      if (dist < 750) continue;
      this.job = { x, y, t: dist / 170 + 14, limit: dist / 170 + 14 };
      this.job.limit = this.job.t;
      return;
    }
    this.job = { x: roadCenter(ix + 4), y: roadCenter(iy), t: 40, limit: 40 };
  }

  /* -------------------------------------------------------------- effects */
  emit(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, add = false, grow = 0, drag = 1) {
    if (this.parts.length > 650) return;
    const p = this.pool.pop() || ({} as Part);
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.kind = kind;
    p.rot = Math.random() * TAU;
    p.vr = (Math.random() - 0.5) * 16;
    p.add = add;
    p.grow = grow;
    p.drag = drag;
    this.parts.push(p);
  }

  sparks(x: number, y: number, n: number, spd: number, color = "#ffd27a") {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = rnd(0.3, 1) * spd;
      this.emit(0, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.2, 0.5), rnd(1.5, 2.5), color, true, 0, 2.2);
    }
  }

  popup(x: number, y: number, text: string, color: string, size = 16) {
    if (this.popups.length > 14) this.popups.shift();
    this.popups.push({ x, y, text, color, t: 0, max: 1.1, size });
  }

  say(text: string, sub: string, color: string) {
    this.banner = { text, sub, color, t: 0 };
  }

  addTrauma(t: number) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  award(pts: number, label: string, x: number, y: number, color = "#ffd400") {
    const old = this.mult;
    this.combo++;
    this.comboT = 3.4;
    this.mult = Math.min(10, 1 + Math.floor(this.combo / 3));
    const total = pts * this.mult;
    this.score += total;
    this.scoreBump = 1;
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    this.popup(x, y - 18, `${label} +${total}`, color, 15 + Math.min(10, pts / 60));
    if (this.mult > old) {
      this.say(`COMBO x${this.mult}`, "KEEP THE CHAIN ALIVE", "#ffd400");
      sfx.power();
      this.punch = 0.06;
    }
  }

  addHeat(h: number) {
    const old = Math.floor(this.heat);
    this.heat = Math.min(5, this.heat + h);
    this.evadeT = 0;
    const n = Math.floor(this.heat);
    if (n > old) {
      this.say(`${"★".repeat(n)} WANTED`, n >= 3 ? "THEY'RE CALLING EVERYONE" : "COPS INCOMING", "#ff2d95");
      sfx.star();
      this.addTrauma(0.3);
      this.flash = 0.25;
      this.flashColor = "#ff2d95";
    }
  }

  /* --------------------------------------------------------------- update */
  update(raw: number) {
    this.time += raw;
    if (this.phase === "paused") return;
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      this.updateCamera(raw * 0.2);
      this.trauma = Math.max(0, this.trauma - raw * 0.5);
      return;
    }
    let dt = Math.min(raw, 1 / 30);
    if (this.phase === "over") dt *= 0.35;
    this.dtNow = dt;
    this.simT += dt;
    const playing = this.phase === "playing";
    const P = this.P;

    if (playing && this.actionQ) this.doAction();
    this.actionQ = false;

    if (playing && !P.veh) this.footUpdate(dt);

    this.updateVehicles(dt, playing);
    this.collide();
    this.updatePeds(dt, playing);
    this.updatePickups(dt, playing);
    this.manage(dt, playing);
    if (playing || this.phase === "over") this.systems(dt, playing);
    this.updateFx(dt);
    if (this.pv && P.veh) {
      P.x = P.veh.x;
      P.y = P.veh.y;
      P.a = P.veh.a;
    }
    this.updateCamera(dt);
    this.audio(playing);
  }

  /* ------------------------------------------------------------- controls */
  private readInput(v: Vehicle | null) {
    const k = this.keys;
    let thr = 0;
    let steer = 0;
    let mx = 0;
    let my = 0;
    if (k.ArrowUp || k.KeyW) {
      thr += 1;
      my -= 1;
    }
    if (k.ArrowDown || k.KeyS) {
      thr -= 1;
      my += 1;
    }
    if (k.ArrowLeft || k.KeyA) {
      steer -= 1;
      mx -= 1;
    }
    if (k.ArrowRight || k.KeyD) {
      steer += 1;
      mx += 1;
    }
    let boost = !!(k.ShiftLeft || k.ShiftRight || this.btn.nitro);
    const brake = !!(k.Space || this.btn.brake);
    const st = this.stick;
    const mag = Math.hypot(st.x, st.y);
    if (st.on && mag > 0.14) {
      mx = st.x;
      my = st.y;
      if (v) {
        const des = Math.atan2(st.y, st.x);
        const diff = wrap(des - v.a);
        const ad = Math.abs(diff);
        const fwd = v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a);
        if (ad > 2.45) {
          thr = -1;
          steer = 0;
        } else {
          steer = clamp(diff * 2.6, -1, 1);
          thr = Math.min(1, mag * 1.5) * (ad > 1.7 ? 0.55 : 1);
          if (fwd < -30) thr = 1;
        }
        this.steerS = steer;
      }
    } else if (v) {
      // keyboard steering eases in/out for control that feels tight but smooth
      const rate = steer === 0 ? 16 : 10;
      this.steerS += clamp(steer - this.steerS, -rate * this.dtNow, rate * this.dtNow);
      steer = this.steerS;
    }
    if (this.phase !== "playing") {
      thr = 0;
      steer = 0;
      boost = false;
    }
    return { thr, steer, boost, brake: this.phase === "playing" && brake, mx, my };
  }

  private doAction() {
    const P = this.P;
    if (P.veh) {
      const v = P.veh;
      const sp = Math.hypot(v.vx, v.vy);
      if (sp > 190) return;
      const c = Math.cos(v.a);
      const s = Math.sin(v.a);
      const m = MODELS[v.model];
      P.x = v.x - s * (m.wid / 2 + 12);
      P.y = v.y + c * (m.wid / 2 + 12);
      P.vx = v.vx * 0.5;
      P.vy = v.vy * 0.5;
      P.veh = null;
      v.ctrl = "free";
      v.driver = false;
      v.boosting = false;
      this.pv = null;
      sfx.door();
      sfx.engine(0, false, false);
      this.sparks(P.x, P.y, 6, 80, "#fff");
    } else if (this.nearVeh) {
      const v = this.nearVeh;
      if (v.ctrl === "ai" || (v.ctrl === "free" && v.driver)) {
        this.spawnDriver(v);
        this.award(100, "CARJACK", v.x, v.y, "#ff2d95");
        this.addHeat(0.5);
        this.addTrauma(0.25);
      }
      v.ctrl = "player";
      v.driver = true;
      v.hitT = 99;
      v.vx *= 0.5;
      v.vy *= 0.5;
      P.veh = v;
      this.pv = v;
      this.punch = 0.08;
      sfx.door();
      this.sparks(v.x, v.y, 10, 120, "#00e5ff");
    }
  }

  private spawnDriver(v: Vehicle) {
    const m = MODELS[v.model];
    const side = v.a + Math.PI / 2;
    const x = v.x + Math.cos(side) * (m.wid / 2 + 8);
    const y = v.y + Math.sin(side) * (m.wid / 2 + 8);
    v.driver = false;
    this.peds.push({
      x,
      y,
      vx: 0,
      vy: 0,
      a: side + rnd(-0.5, 0.5),
      state: 1,
      t: 0,
      turnT: 2,
      spin: 0,
      z: 0,
      vz: 0,
      color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0],
      speed: 70,
      byPlayer: false,
    });
  }

  private footUpdate(dt: number) {
    const P = this.P;
    const c = this.readInput(null);
    const sp = c.boost ? 175 : 115;
    let mx = c.mx;
    let my = c.my;
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    const k = 1 - Math.exp(-12 * dt);
    P.vx += (mx * sp - P.vx) * k;
    P.vy += (my * sp - P.vy) * k;
    P.x += P.vx * dt;
    P.y += P.vy * dt;
    for (let i = 0; i < 2; i++) {
      if (circleVsBuildings(P.x, P.y, 6, this.hit)) {
        P.x += this.hit.nx * this.hit.pen;
        P.y += this.hit.ny * this.hit.pen;
      }
    }
    const s = Math.hypot(P.vx, P.vy);
    if (s > 10) {
      P.a = Math.atan2(P.vy, P.vx);
      P.walk += s * dt * 0.1;
      if (c.boost && Math.random() < 0.3) this.emit(1, P.x, P.y, 0, 0, 0.3, 3, "#aab", false, 10, 2);
    }
    P.hurtCool -= dt;
    // nearest enterable vehicle
    let best: Vehicle | null = null;
    let bd = 1e9;
    for (const v of this.vehicles) {
      if (v.dead || v.model === M_COP) continue;
      const d = Math.hypot(v.x - P.x, v.y - P.y);
      const m = MODELS[v.model];
      if (d < m.len / 2 + 22 && d < bd && Math.hypot(v.vx, v.vy) < 220) {
        bd = d;
        best = v;
      }
    }
    this.nearVeh = best;
  }

  /* ------------------------------------------------------------ vehicles */
  driveCar(v: Vehicle, thr: number, steer: number, hb: boolean, boost: boolean, dt: number) {
    const m = MODELS[v.model];
    const c0 = Math.cos(v.a);
    const s0 = Math.sin(v.a);
    let vf = v.vx * c0 + v.vy * s0;
    const speed = Math.hypot(v.vx, v.vy);
    const auth = Math.min(1, Math.abs(vf) / 80) * (1 - Math.min(0.5, speed / (m.maxSpd * 2.2)));
    const sign = vf >= -4 ? 1 : -1;
    v.a += steer * m.turn * auth * sign * (hb ? 1.4 : 1) * dt;
    v.steer = steer;
    const c = Math.cos(v.a);
    const s = Math.sin(v.a);
    vf = v.vx * c + v.vy * s;
    let vl = -v.vx * s + v.vy * c;
    let acc = m.acc;
    let maxF = m.maxSpd;
    if (boost) {
      acc *= 2.3;
      maxF *= 1.5;
    }
    v.braking = false;
    if (thr > 0) {
      if (vf < 0) {
        vf += m.brake * dt;
        v.braking = true;
      } else if (vf < maxF) vf = Math.min(maxF, vf + acc * thr * dt * (1 - (vf / maxF) * 0.55));
    } else if (thr < 0) {
      if (vf > 8) {
        vf -= m.brake * dt;
        v.braking = true;
      } else vf = Math.max(-m.maxSpd * 0.4, vf - acc * 0.55 * dt);
    } else vf *= Math.exp(-0.9 * dt);
    vf *= Math.exp(-0.1 * dt);
    if (vf > maxF) vf -= (vf - maxF) * Math.min(1, 2.2 * dt);
    if (hb) {
      vf *= Math.exp(-0.9 * dt);
      v.braking = true;
    }
    const grip = hb ? 1.5 : 7 - Math.abs(steer) * Math.min(3.2, (speed / m.maxSpd) * 3.6);
    vl *= Math.exp(-grip * dt);
    v.vx = c * vf - s * vl;
    v.vy = s * vf + c * vl;
    v.drifting = Math.abs(vl) > 62 && speed > 130;
  }

  private updateVehicles(dt: number, playing: boolean) {
    const vs = this.vehicles;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      v.age += dt;
      v.hitT += dt;
      v.flashT -= dt;
      const m = MODELS[v.model];
      switch (v.ctrl) {
        case "player":
          if (v === this.pv) this.playerDrive(v, dt, playing);
          else this.driveCar(v, 0, 0, false, false, dt);
          break;
        case "ai":
          this.aiUpdate(v, dt);
          break;
        case "cop":
          this.copUpdate(v, dt);
          break;
        case "free":
          this.driveCar(v, 0, 0, false, false, dt);
          v.vx *= Math.exp(-0.5 * dt);
          v.vy *= Math.exp(-0.5 * dt);
          if (v.driver && Math.hypot(v.vx, v.vy) < 14) {
            v.stuckT += dt;
            if (v.stuckT > 0.9) this.spawnDriver(v);
          }
          break;
        case "wreck":
          v.vx *= Math.exp(-2.5 * dt);
          v.vy *= Math.exp(-2.5 * dt);
          v.deadT += dt;
          break;
      }
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      if (v.ctrl !== "ai") {
        v.a += v.av * dt;
        v.av *= Math.exp(-(v.ctrl === "free" || v.ctrl === "wreck" ? 2.4 : 5) * dt);
      } else v.av = 0;

      // damage states
      if (!v.dead) {
        if (v.hp <= 22) {
          v.hp -= 4.5 * dt;
          if (v.hp <= 0) {
            this.explode(v);
            continue;
          }
        }
        v.smokeT -= dt;
        if (v.hp < 55 && v.smokeT <= 0) {
          v.smokeT = v.hp < 30 ? 0.05 : 0.11;
          const c = Math.cos(v.a);
          const s = Math.sin(v.a);
          const fx = v.x + c * m.len * 0.35;
          const fy = v.y + s * m.len * 0.35;
          this.emit(1, fx, fy, rnd(-12, 12), rnd(-12, 12) - 14, rnd(0.6, 1.1), rnd(5, 8), v.hp < 30 ? "#222" : "#777", false, 16, 1.5);
          if (v.hp < 30) this.emit(2, fx, fy, rnd(-30, 30), rnd(-30, 30), 0.35, rnd(5, 8), "#ff8a00", true, -6, 1.5);
        }
      } else if (v.deadT < 14) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = 0.08;
          this.emit(2, v.x + rnd(-10, 10), v.y + rnd(-6, 6), rnd(-15, 15), rnd(-15, 15), 0.45, rnd(6, 11), "#ff7a00", true, -10, 1.5);
          this.emit(1, v.x + rnd(-10, 10), v.y + rnd(-6, 6), rnd(-10, 10), rnd(-26, -8), rnd(0.9, 1.6), rnd(7, 11), "#1b1b22", false, 20, 1.4);
        }
      }
      if (v.ctrl === "player" && v !== this.pv && v.drifting) v.drifting = false;
      // drift fx
      if (v.drifting && !v.dead) this.driftFx(v, m.len, m.wid);
    }
  }

  private driftFx(v: Vehicle, len: number, wid: number) {
    const c = Math.cos(v.a);
    const s = Math.sin(v.a);
    for (let side = -1; side <= 1; side += 2) {
      const wx = v.x - c * len * 0.32 - s * wid * 0.42 * side;
      const wy = v.y - s * len * 0.32 + c * wid * 0.42 * side;
      this.skids.push({ x1: wx, y1: wy, x2: wx - v.vx * 0.02, y2: wy - v.vy * 0.02, t: 0 });
      if (Math.random() < 0.5) this.emit(1, wx, wy, rnd(-14, 14), rnd(-14, 14), rnd(0.4, 0.8), rnd(4, 7), "#cfd3ee", false, 18, 1.5);
    }
    if (this.skids.length > 900) this.skids.splice(0, 100);
  }

  private playerDrive(v: Vehicle, dt: number, playing: boolean) {
    const c = this.readInput(v);
    let boost = false;
    let thr = c.thr;
    if (c.boost && this.nitro > 1) {
      boost = true;
      if (thr === 0) thr = 1;
      if (thr < 0) boost = false;
    }
    if (boost) {
      this.nitro = Math.max(0, this.nitro - 34 * dt);
      const cc = Math.cos(v.a);
      const ss = Math.sin(v.a);
      const m = MODELS[v.model];
      for (let k = 0; k < 2; k++) {
        const o = (k - 0.5) * 9;
        this.emit(2, v.x - cc * m.len * 0.5 - ss * o, v.y - ss * m.len * 0.5 + cc * o, -cc * 120 + rnd(-30, 30), -ss * 120 + rnd(-30, 30), rnd(0.18, 0.32), rnd(5, 8), k ? "#00e5ff" : "#7a5cff", true, -10, 1.5);
      }
      if (!v.boosting) {
        sfx.boost();
        this.addTrauma(0.22);
        this.punch = 0.1;
      }
    } else if (playing) this.nitro = Math.min(100, this.nitro + 7 * dt);
    v.boosting = boost;
    this.driveCar(v, thr, c.steer, c.brake, boost, dt);

    const sp = Math.hypot(v.vx, v.vy);
    if (sp > this.stats.topSpeed) this.stats.topSpeed = sp;
    // drift scoring
    if (v.drifting && playing) {
      this.driftT += dt;
      if (this.driftT > 0.55) {
        this.driftT = 0;
        this.award(20, "DRIFT", v.x, v.y - 10, "#00e5ff");
      }
      sfx.skid(1);
    } else this.driftT = Math.max(0, this.driftT - dt);
    // near-miss
    if (playing && sp > 200) {
      for (const o of this.vehicles) {
        if (o === v || o.nm || o.dead) continue;
        const d = Math.hypot(o.x - v.x, o.y - v.y);
        if (d > 27 && d < 50) {
          o.nm = true;
          this.award(40, "NEAR MISS", o.x, o.y, "#7cff4a");
          this.sparks(o.x, o.y, 5, 60, "#7cff4a");
        }
      }
    }
    // gentle regen of on-foot health while driving
    this.P.hp = Math.min(100, this.P.hp + 3 * dt);
  }

  private aiUpdate(v: Vehicle, dt: number) {
    const ci = Math.floor(v.x / CELL);
    const cj = Math.floor(v.y / CELL);
    if (mod(v.x, CELL) < ROAD && mod(v.y, CELL) < ROAD) {
      const key = ci * 10007 + cj;
      if (key !== v.lastInter) {
        v.lastInter = key;
        const r = Math.random();
        let nd = v.dir;
        if (r < 0.26) nd = (v.dir + 1) % 4;
        else if (r < 0.5) nd = (v.dir + 3) % 4;
        if (nd !== v.dir) {
          const icx = ci * CELL + ROAD / 2;
          const icy = cj * CELL + ROAD / 2;
          const NA = DIR_A[nd];
          const sign = v.dir === 0 || v.dir === 1 ? 1 : -1;
          v.turnDir = nd;
          v.turnVal = (v.dir % 2 === 0 ? icx - Math.sin(NA) * LANE : icy + Math.cos(NA) * LANE) - sign * 14;
        }
      }
    }
    if (v.turnDir >= 0) {
      const pos = v.dir % 2 === 0 ? v.x : v.y;
      const sign = v.dir === 0 || v.dir === 1 ? 1 : -1;
      if ((pos - v.turnVal) * sign >= 0) {
        v.dir = v.turnDir;
        v.turnDir = -1;
      }
    }
    const A = DIR_A[v.dir];
    let err: number;
    if (v.dir % 2 === 0) {
      const cy = roadCenter(Math.floor(v.y / CELL));
      err = (v.y - (cy + Math.cos(A) * LANE)) * Math.cos(A);
    } else {
      const cx = roadCenter(Math.floor(v.x / CELL));
      err = (v.x - (cx - Math.sin(A) * LANE)) * -Math.sin(A);
    }
    const des = A - clamp(err * 0.045, -0.75, 0.75);
    const rate = v.turnDir >= 0 || mod(v.x, CELL) < ROAD ? 5 : 3.5;
    v.a += clamp(wrap(des - v.a), -rate * dt, rate * dt);

    const c = Math.cos(v.a);
    const s = Math.sin(v.a);
    let target = v.turnDir >= 0 ? Math.min(v.cruise, 75) : v.cruise;
    if (v.yieldT > 0) v.yieldT -= dt;
    else {
      for (const o of this.vehicles) {
        if (o === v) continue;
        const dx = o.x - v.x;
        const dy = o.y - v.y;
        if (dx > 100 || dx < -100 || dy > 100 || dy < -100) continue;
        const fd = dx * c + dy * s;
        if (fd <= 0 || fd > 85) continue;
        const lat = -dx * s + dy * c;
        if (Math.abs(lat) > 21) continue;
        target = Math.min(target, fd < 46 ? 0 : (fd - 46) * 2.5);
      }
    }
    if (v.sp < 4 && target < 4) {
      v.stuckT += dt;
      if (v.stuckT > 2.2) {
        v.yieldT = 1.8;
        v.stuckT = 0;
      }
    } else v.stuckT = 0;
    v.sp += clamp(target - v.sp, -420 * dt, 110 * dt);
    v.braking = target < v.sp - 5;
    v.vx = c * v.sp;
    v.vy = s * v.sp;
  }

  private copUpdate(v: Vehicle, dt: number) {
    const P = this.P;
    let tx = P.x;
    let ty = P.y;
    const speed = Math.hypot(v.vx, v.vy);
    const dist = Math.hypot(tx - v.x, ty - v.y);
    if (P.veh) {
      const lead = Math.min(dist / 320, 0.7);
      tx += P.veh.vx * lead;
      ty += P.veh.vy * lead;
    }
    const des = Math.atan2(ty - v.y, tx - v.x);
    const diff = wrap(des - v.a);
    let steer = clamp(diff * 2.6, -1, 1);
    let thr = Math.abs(diff) > 2.2 ? 0.6 : 1;
    const look = 55 + speed * 0.28;
    const fl = pointInBuilding(v.x + Math.cos(v.a - 0.55) * look, v.y + Math.sin(v.a - 0.55) * look);
    const fr = pointInBuilding(v.x + Math.cos(v.a + 0.55) * look, v.y + Math.sin(v.a + 0.55) * look);
    const fc = pointInBuilding(v.x + Math.cos(v.a) * look, v.y + Math.sin(v.a) * look);
    if (fl || fr || fc) {
      if (fl && !fr) steer = 1;
      else if (fr && !fl) steer = -1;
      else steer = diff >= 0 ? 1 : -1;
      if (speed > 170) thr = 0.3;
    }
    if (speed < 24 && dist > 40) {
      v.stuckT += dt;
      if (v.stuckT > 1.1) {
        v.reverseT = 0.9;
        v.stuckT = 0;
      }
    } else v.stuckT = Math.max(0, v.stuckT - dt);
    if (v.reverseT > 0) {
      v.reverseT -= dt;
      thr = -1;
      steer = -steer;
    }
    const hb = Math.abs(diff) > 0.85 && speed > 190 && v.reverseT <= 0;
    this.driveCar(v, thr, steer, hb, false, dt);
  }

  /* ------------------------------------------------------------ damage */
  damage(v: Vehicle, amt: number) {
    if (v.dead || amt <= 0) return;
    v.hp -= amt;
    v.flashT = 0.12;
    if (v === this.pv && this.phase === "playing") this.hurt = Math.min(0.7, this.hurt + amt / 55);
    if (v.hp <= 0) this.explode(v);
  }

  knockPed(p: Ped, vx: number, vy: number, byPlayer: boolean) {
    if (p.state === 2) return;
    p.state = 2;
    p.vx = vx * 1.05 + rnd(-40, 40);
    p.vy = vy * 1.05 + rnd(-40, 40);
    p.z = 1;
    p.vz = 240 + Math.hypot(vx, vy) * 0.35;
    p.spin = rnd(-18, 18);
    p.byPlayer = byPlayer;
    if (byPlayer && this.phase === "playing") {
      this.stats.knocked++;
      this.award(100, "KNOCKDOWN", p.x, p.y, "#ffd400");
      this.addHeat(0.22);
      this.addTrauma(0.2);
      this.hitStop = Math.max(this.hitStop, 0.03);
      sfx.thump();
      this.sparks(p.x, p.y, 12, 220, p.color);
      for (let i = 0; i < 6; i++) this.emit(2, p.x, p.y, rnd(-90, 90), rnd(-90, 90), 0.4, rnd(4, 7), p.color, true, -8, 2);
    }
  }

  explode(v: Vehicle) {
    if (v.dead) return;
    const wasP = v === this.pv;
    v.dead = true;
    v.deadT = 0;
    v.hp = 0;
    v.ctrl = "wreck";
    v.driver = false;
    v.boosting = false;
    v.drifting = false;
    const credit = wasP || v.hitT < 6 || v.model === M_COP;
    const R = 130;
    // shockwave
    for (const o of this.vehicles) {
      if (o === v || o.dead) continue;
      const dx = o.x - v.x;
      const dy = o.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d < R && d > 0.1) {
        const k = 1 - d / R;
        o.vx += (dx / d) * 340 * k;
        o.vy += (dy / d) * 340 * k;
        o.av += (Math.random() - 0.5) * 5 * k;
        if (o.ctrl === "ai") o.ctrl = "free";
        if (credit && o !== this.pv) o.hitT = 0;
        this.damage(o, k * 38);
      }
    }
    for (const p of this.peds) {
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d < R + 20 && p.state !== 2) {
        const k = 1 - d / (R + 20);
        this.knockPed(p, (dx / (d || 1)) * 300 * k, (dy / (d || 1)) * 300 * k, credit && !wasP);
      }
    }
    // visuals
    this.emit(4, v.x, v.y, 0, 0, 0.55, 20, "#ffb347", true, 520, 1);
    this.emit(4, v.x, v.y, 0, 0, 0.4, 10, "#ffffff", true, 380, 1);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const s = rnd(30, 300);
      this.emit(2, v.x, v.y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.4, 0.9), rnd(10, 22), Math.random() < 0.5 ? "#ff8a00" : "#ffd24a", true, -12, 2);
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const s = rnd(20, 140);
      this.emit(1, v.x, v.y, Math.cos(a) * s, Math.sin(a) * s, rnd(1, 2), rnd(10, 18), "#222", false, 26, 1.8);
    }
    this.sparks(v.x, v.y, 36, 480, "#ffe08a");
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      const s = rnd(80, 380);
      this.emit(3, v.x, v.y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.6, 1.2), rnd(2, 4.5), v.color, false, 0, 2.5);
    }
    const dist = Math.hypot(v.x - this.cam.x, v.y - this.cam.y);
    this.addTrauma(wasP ? 1 : clamp(1.1 - dist / 700, 0.2, 0.9));
    if (dist < 800) {
      this.hitStop = 0.09;
      this.flash = 0.6;
      this.flashColor = "#ffd9a0";
    }
    sfx.explode();
    v.vx *= 0.2;
    v.vy *= 0.2;
    v.color = "#14141a";
    if (wasP) {
      const P = this.P;
      const c = Math.cos(v.a);
      const s = Math.sin(v.a);
      P.veh = null;
      this.pv = null;
      P.x = v.x - s * 26;
      P.y = v.y + c * 26;
      P.vx = -s * 220;
      P.vy = c * 220;
      P.hp -= 40;
      this.hurt = 0.7;
      sfx.engine(0, false, false);
      if (this.phase === "playing") {
        if (P.hp <= 0) this.gameOver("WRECKED");
        else this.say("CAR DESTROYED", "FIND NEW WHEELS · PRESS E NEAR A CAR", "#ff6a2d");
      }
    } else if (credit && this.phase === "playing") {
      this.stats.wrecked++;
      if (v.model === M_COP) {
        this.award(600, "COP DOWN", v.x, v.y, "#00e5ff");
        this.addHeat(1);
      } else {
        this.award(300, "WRECKED", v.x, v.y, "#ff6a2d");
        this.addHeat(0.3);
      }
    }
  }

  /* ------------------------------------------------------------- collide */
  private collide() {
    const vs = this.vehicles;
    const H = this.hit;
    for (let n = 0; n < vs.length; n++) {
      const v = vs[n];
      const m = MODELS[v.model];
      const c = Math.cos(v.a);
      const s = Math.sin(v.a);
      const r = m.wid * 0.56;
      for (let k = -1; k <= 1; k++) {
        let px = v.x + c * m.len * 0.3 * k;
        let py = v.y + s * m.len * 0.3 * k;
        for (let it = 0; it < 2; it++) {
          if (!circleVsBuildings(px, py, r, H)) break;
          const nx = H.nx;
          const ny = H.ny;
          v.x += nx * H.pen;
          v.y += ny * H.pen;
          px += nx * H.pen;
          py += ny * H.pen;
          const vn = v.vx * nx + v.vy * ny;
          if (vn < -4) {
            const impact = -vn;
            v.vx -= (1 + 0.32) * vn * nx;
            v.vy -= (1 + 0.32) * vn * ny;
            v.vx *= 0.985;
            v.vy *= 0.985;
            if (v.ctrl === "ai") {
              v.sp = 0;
              if (impact > 50) v.ctrl = "free";
            }
            if (impact > 40) {
              const cr = (px - v.x) * ny - (py - v.y) * nx;
              v.av += cr * impact * 0.0011 * (v.ctrl === "player" ? 0.6 : 1);
              v.av = clamp(v.av, -6, 6);
              this.contactFx(H.px, H.py, impact, v === this.pv, v);
              if (impact > 95 && !v.dead) this.damage(v, (impact - 95) * 0.1 * (v === this.pv ? 0.8 : 1));
            }
          }
        }
      }
    }
    // vehicle vs vehicle
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      const ma = MODELS[a.model];
      const ca = Math.cos(a.a);
      const sa = Math.sin(a.a);
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx > 80 || dx < -80 || dy > 80 || dy < -80) continue;
        const mb = MODELS[b.model];
        const lim = (ma.len + mb.len) / 2 + 6;
        if (dx * dx + dy * dy > lim * lim) continue;
        const cb = Math.cos(b.a);
        const sb = Math.sin(b.a);
        const ra = ma.wid * 0.58;
        const rb = mb.wid * 0.58;
        let best = 0;
        let pax = 0,
          pay = 0,
          pbx = 0,
          pby = 0,
          bd = 1;
        for (let ia = -1; ia <= 1; ia += 2) {
          const ax = a.x + ca * ma.len * 0.26 * ia;
          const ay = a.y + sa * ma.len * 0.26 * ia;
          for (let ib = -1; ib <= 1; ib += 2) {
            const bx = b.x + cb * mb.len * 0.26 * ib;
            const by = b.y + sb * mb.len * 0.26 * ib;
            const d = Math.hypot(ax - bx, ay - by);
            const pen = ra + rb - d;
            if (pen > best) {
              best = pen;
              pax = ax;
              pay = ay;
              pbx = bx;
              pby = by;
              bd = d;
            }
          }
        }
        if (best <= 0) continue;
        let nx = 1;
        let ny = 0;
        if (bd > 1e-3) {
          nx = (pax - pbx) / bd;
          ny = (pay - pby) / bd;
        }
        const ia = a.dead ? 0.35 : 1 / ma.mass;
        const ib = b.dead ? 0.35 : 1 / mb.mass;
        const sum = ia + ib;
        a.x += nx * best * (ia / sum);
        a.y += ny * best * (ia / sum);
        b.x -= nx * best * (ib / sum);
        b.y -= ny * best * (ib / sum);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel >= 0) continue;
        const impact = -rel;
        const j2 = (-(1 + 0.42) * rel) / sum;
        a.vx += nx * j2 * ia;
        a.vy += ny * j2 * ia;
        b.vx -= nx * j2 * ib;
        b.vy -= ny * j2 * ib;
        if (impact > 30) {
          a.av += ((pax - a.x) * ny - (pay - a.y) * nx) * j2 * ia * 0.0032;
          b.av -= ((pbx - b.x) * ny - (pby - b.y) * nx) * j2 * ib * 0.0032;
          a.av = clamp(a.av, -6, 6);
          b.av = clamp(b.av, -6, 6);
          if (a.ctrl === "ai") a.ctrl = "free";
          if (b.ctrl === "ai") b.ctrl = "free";
        }
        // attribution (chains count!)
        if (a.ctrl === "player" || a.hitT < 2) {
          if (b.ctrl !== "player") b.hitT = 0;
        }
        if (b.ctrl === "player" || b.hitT < 2) {
          if (a.ctrl !== "player") a.hitT = 0;
        }
        const involvesP = a === this.pv || b === this.pv;
        if (impact > 60) this.contactFx((pax + pbx) / 2, (pay + pby) / 2, impact, involvesP, a);
        if (impact > 95) {
          const base = (impact - 95) * 0.12;
          if (!a.dead) this.damage(a, base * (mb.mass / (ma.mass + mb.mass)) * 2 * (a === this.pv ? 0.75 : 1));
          if (!b.dead) this.damage(b, base * (ma.mass / (ma.mass + mb.mass)) * 2 * (b === this.pv ? 0.75 : 1));
        }
        if (involvesP && impact > 170 && this.smashCool <= 0 && this.phase === "playing") {
          this.smashCool = 0.45;
          this.award(30, "SMASH", (pax + pbx) / 2, (pay + pby) / 2, "#ff6a2d");
          if (a.model === M_COP || b.model === M_COP) this.addHeat(0.1);
        }
      }
    }
    // on-foot player vs vehicles
    const P = this.P;
    if (!P.veh && this.phase === "playing" && P.hurtCool <= 0) {
      for (const v of vs) {
        if (v.dead) continue;
        const sp = Math.hypot(v.vx, v.vy);
        if (sp < 90) continue;
        const m = MODELS[v.model];
        const dx = P.x - v.x;
        const dy = P.y - v.y;
        const c = Math.cos(v.a);
        const s = Math.sin(v.a);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) < m.len / 2 + 5 && Math.abs(ly) < m.wid / 2 + 5) {
          P.hurtCool = 0.7;
          P.hp -= Math.min(60, sp * 0.16);
          const d = Math.hypot(dx, dy) || 1;
          P.vx = (dx / d) * 260 + v.vx * 0.5;
          P.vy = (dy / d) * 260 + v.vy * 0.5;
          this.hurt = 0.7;
          this.addTrauma(0.5);
          this.hitStop = 0.05;
          sfx.thump();
          this.sparks(P.x, P.y, 14, 220, "#ff2d95");
          if (P.hp <= 0) this.gameOver("WRECKED");
          break;
        }
      }
    }
  }

  private contactFx(x: number, y: number, impact: number, involvesP: boolean, v: Vehicle) {
    const n = Math.min(16, 3 + impact / 28);
    this.sparks(x, y, n | 0, 120 + impact * 0.8);
    const dist = Math.hypot(x - this.cam.x, y - this.cam.y);
    const near = dist < 700;
    if (near) this.addTrauma(clamp(impact / 750, 0, 0.7) * (involvesP ? 1 : 0.5));
    if (this.sfxCool <= 0 && near) {
      this.sfxCool = 0.06;
      sfx.crash(impact / 450);
    }
    if (involvesP && impact > 330) {
      this.hitStop = Math.max(this.hitStop, 0.05);
      this.punch = 0.1;
    }
    if (impact > 150) {
      for (let i = 0; i < 4; i++) this.emit(3, x, y, rnd(-150, 150), rnd(-150, 150), rnd(0.4, 0.8), rnd(2, 4), v.color, false, 0, 2.5);
    }
  }

  /* ---------------------------------------------------------------- peds */
  private updatePeds(dt: number, playing: boolean) {
    const peds = this.peds;
    const vs = this.vehicles;
    const H = this.hit;
    const threats: Vehicle[] = [];
    for (const v of vs) if ((v === this.pv || v.ctrl === "cop") && Math.hypot(v.vx, v.vy) > 120) threats.push(v);
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      p.t += dt;
      if (p.state === 2) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vz -= 900 * dt;
        p.vx *= Math.exp(-0.6 * dt);
        p.vy *= Math.exp(-0.6 * dt);
        p.a += p.spin * dt;
        if (circleVsBuildings(p.x, p.y, 4, H)) {
          p.x += H.nx * H.pen;
          p.y += H.ny * H.pen;
          const vn = p.vx * H.nx + p.vy * H.ny;
          if (vn < 0) {
            p.vx -= 1.6 * vn * H.nx;
            p.vy -= 1.6 * vn * H.ny;
          }
        }
        if (p.z <= 0 && p.vz < 0) {
          // landing: burst into cash
          if (p.byPlayer) {
            const n = 1 + ((Math.random() * 2.2) | 0);
            for (let k = 0; k < n; k++) {
              const a = Math.random() * TAU;
              this.pickups.push({ x: p.x, y: p.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, kind: 0, t: 0 });
            }
            for (let k = 0; k < 8; k++) this.emit(2, p.x, p.y, rnd(-110, 110), rnd(-110, 110), 0.5, rnd(3, 6), "#ffd400", true, -6, 2);
          } else this.sparks(p.x, p.y, 4, 80, p.color);
          this.emit(4, p.x, p.y, 0, 0, 0.3, 4, p.color, true, 90, 1);
          peds.splice(i, 1);
        }
        continue;
      }
      // threat check
      if (p.state === 0) {
        for (const t of threats) {
          const dx = p.x - t.x;
          const dy = p.y - t.y;
          if (dx * dx + dy * dy < 150 * 150) {
            p.state = 1;
            p.a = Math.atan2(dy, dx) + rnd(-0.7, 0.7);
            p.speed = rnd(90, 125);
            p.t = 0;
            break;
          }
        }
      } else if (p.t > 4.5) {
        p.state = 0;
        p.speed = rnd(26, 46);
      }
      p.turnT -= dt;
      if (p.turnT <= 0) {
        p.turnT = rnd(1.5, 4.5);
        if (p.state === 0) p.a += rnd(-1.2, 1.2);
      }
      p.x += Math.cos(p.a) * p.speed * dt;
      p.y += Math.sin(p.a) * p.speed * dt;
      if (circleVsBuildings(p.x, p.y, 4.5, H)) {
        p.x += H.nx * H.pen;
        p.y += H.ny * H.pen;
        // slide along wall
        const tx = -H.ny;
        const ty = H.nx;
        const dir = Math.cos(p.a) * tx + Math.sin(p.a) * ty >= 0 ? 1 : -1;
        p.a = Math.atan2(ty * dir, tx * dir) + rnd(-0.2, 0.2);
      }
      // hit by vehicles
      for (const v of vs) {
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        if (dx > 40 || dx < -40 || dy > 40 || dy < -40) continue;
        const sp = Math.hypot(v.vx, v.vy);
        if (sp < 70) continue;
        const m = MODELS[v.model];
        const c = Math.cos(v.a);
        const s = Math.sin(v.a);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) < m.len / 2 + 3 && Math.abs(ly) < m.wid / 2 + 3) {
          const credit = playing && (v === this.pv || v.hitT < 2);
          this.knockPed(p, v.vx, v.vy, credit);
          if (v === this.pv) {
            v.vx *= 0.97;
            v.vy *= 0.97;
          }
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------- pickups */
  private updatePickups(dt: number, playing: boolean) {
    const P = this.P;
    const inCar = !!P.veh;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-3 * dt);
      p.vy *= Math.exp(-3 * dt);
      if (!playing) continue;
      const dx = P.x - p.x;
      const dy = P.y - p.y;
      const d = Math.hypot(dx, dy);
      const mag = inCar ? 120 : 60;
      if (d < mag && d > 1 && p.t > 0.25) {
        const k = (1 - d / mag) * 520 * dt;
        p.x += (dx / d) * k;
        p.y += (dy / d) * k;
      }
      if (d < (inCar ? 32 : 22) && p.t > 0.15) {
        this.pickups.splice(i, 1);
        if (p.kind === 0) {
          this.coinStreak = this.simT - this.coinT < 1.2 ? this.coinStreak + 1 : 0;
          this.coinT = this.simT;
          this.score += 25;
          this.scoreBump = Math.max(this.scoreBump, 0.6);
          sfx.coin(this.coinStreak);
          for (let k = 0; k < 5; k++) this.emit(2, p.x, p.y, rnd(-80, 80), rnd(-80, 80), 0.35, rnd(2.5, 4.5), "#ffe066", true, -6, 2);
          this.emit(4, p.x, p.y, 0, 0, 0.25, 4, "#ffe066", true, 70, 1);
        } else if (p.kind === 1) {
          if (P.veh) P.veh.hp = Math.min(P.veh.maxHp, P.veh.hp + 50);
          P.hp = Math.min(100, P.hp + 40);
          this.popup(p.x, p.y - 16, "REPAIR +50", "#7cff4a", 16);
          sfx.power();
          for (let k = 0; k < 14; k++) this.emit(2, p.x, p.y, rnd(-130, 130), rnd(-130, 130), 0.5, rnd(3, 6), "#7cff4a", true, -6, 2);
        } else {
          this.nitro = Math.min(100, this.nitro + 60);
          this.popup(p.x, p.y - 16, "NITRO +60", "#00e5ff", 16);
          sfx.power();
          for (let k = 0; k < 14; k++) this.emit(2, p.x, p.y, rnd(-130, 130), rnd(-130, 130), 0.5, rnd(3, 6), "#00e5ff", true, -6, 2);
        }
      }
    }
  }

  /* ---------------------------------------------------- spawn management */
  private manage(dt: number, playing: boolean) {
    const R = this.visR();
    const far = R + 520;
    const px = this.cam.x;
    const py = this.cam.y;
    // despawn
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v === this.pv || (v.ctrl === "player")) continue;
      const d = Math.hypot(v.x - px, v.y - py);
      if (d > far || (v.dead && v.deadT > 40 && d > R)) this.vehicles.splice(i, 1);
    }
    for (let i = this.peds.length - 1; i >= 0; i--) if (Math.hypot(this.peds[i].x - px, this.peds[i].y - py) > far - 120) this.peds.splice(i, 1);
    for (let i = this.pickups.length - 1; i >= 0; i--) if (Math.hypot(this.pickups[i].x - px, this.pickups[i].y - py) > far + 100) this.pickups.splice(i, 1);
    // spawn
    let traffic = 0;
    let cops = 0;
    for (const v of this.vehicles) {
      if (v.ctrl === "ai" || v.ctrl === "free") traffic++;
      else if (v.ctrl === "cop") cops++;
    }
    if (traffic < 40) this.spawnTraffic();
    if (this.peds.length < 60) this.spawnPed();
    if (this.pickups.length < 24 && Math.random() < 0.06) this.spawnTrail();
    this.copCool -= dt;
    if (playing) {
      const target = COPS[Math.floor(this.heat)];
      if (cops < target && this.copCool <= 0) {
        const s = this.snapRoad(R + 120);
        if (s && Math.hypot(s.x - this.P.x, s.y - this.P.y) > R * 0.9) {
          const v = this.newVehicle(M_COP, s.x, s.y, DIR_A[s.dir], "cop", "#f4f6ff", s.dir);
          const toP = Math.atan2(this.P.y - s.y, this.P.x - s.x);
          v.a = toP;
          v.vx = Math.cos(toP) * 120;
          v.vy = Math.sin(toP) * 120;
          this.vehicles.push(v);
          this.copCool = 1.6;
        }
      }
    }
    this.cops = cops;
  }
  cops = 0;

  /* ------------------------------------------------------------- systems */
  private systems(dt: number, playing: boolean) {
    const P = this.P;
    this.smashCool -= dt;
    this.sfxCool -= dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.mult = 1;
      }
    }
    this.scoreBump = Math.max(0, this.scoreBump - dt * 4);
    if (!playing) return;
    if (this.hintT > 0) this.hintT -= dt;
    // scripted first-chase so the loop hits fast
    if (!this.scripted && this.simT > 12 && this.heat < 1) {
      this.scripted = true;
      this.addHeat(1 - this.heat);
    }
    // wanted decay
    let nearest = 1e9;
    let close = 0;
    for (const v of this.vehicles) {
      if (v.ctrl !== "cop") continue;
      const d = Math.hypot(v.x - P.x, v.y - P.y);
      if (d < nearest) nearest = d;
      if (d < 64) close++;
    }
    if (this.heat > 0) {
      if (nearest > 560) {
        this.evadeT += dt;
        if (this.evadeT > 5) {
          this.heat -= 0.28 * dt;
          if (this.heat <= 0) {
            this.heat = 0;
            this.award(250, "COPS LOST", P.x, P.y, "#00e5ff");
            this.say("LOST THE HEAT", "BACK TO THE MAYHEM", "#00e5ff");
            sfx.power();
          }
        }
      } else this.evadeT = 0;
    }
    // busted meter
    const speed = P.veh ? Math.hypot(P.veh.vx, P.veh.vy) : 0;
    if (close > 0 && (speed < 110 || !P.veh)) this.bust += dt * (P.veh ? 0.4 : 0.6) * (1 + (close - 1) * 0.35);
    else this.bust = Math.max(0, this.bust - dt * 0.6);
    if (this.bust >= 1) {
      this.gameOver("BUSTED");
      return;
    }
    // burning warning
    this.burning = !!(P.veh && P.veh.hp <= 22 && !P.veh.dead);
    // job
    if (this.job) {
      this.job.t -= dt;
      if (P.veh && Math.hypot(P.x - this.job.x, P.y - this.job.y) < 80) {
        const bonus = Math.max(0, Math.floor(this.job.t)) * 10;
        this.award(500 + bonus, "DELIVERED", this.job.x, this.job.y, "#ffd400");
        this.stats.jobs++;
        this.say("JOB COMPLETE", bonus > 0 ? `TIME BONUS +${bonus}` : "SMOOTH", "#ffd400");
        sfx.jobDone();
        this.addTrauma(0.35);
        this.flash = 0.3;
        this.flashColor = "#ffd400";
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * TAU;
          const s = rnd(80, 360);
          this.emit(3, this.job.x, this.job.y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.8, 1.6), rnd(3, 5), ["#ff2d95", "#00e5ff", "#ffd400", "#7cff4a"][i % 4], false, 0, 1.6);
        }
        this.emit(4, this.job.x, this.job.y, 0, 0, 0.7, 30, "#ffd400", true, 500, 1);
        this.addHeat(1);
        this.pickJob();
      }
    }
  }

  gameOver(reason: string) {
    if (this.phase !== "playing") return;
    this.phase = "over";
    this.lastOverAt = performance.now();
    sfx.engine(0, false, false);
    sfx.siren(0);
    sfx.over();
    this.addTrauma(0.8);
    this.flash = 0.8;
    this.flashColor = reason === "BUSTED" ? "#4d6bff" : "#ff2d95";
    this.hitStop = 0.12;
    const score = Math.round(this.score);
    const res = addScore(score, this.simT);
    this.best = res.list[0]?.score ?? score;
    this.onPhase("over", {
      score,
      reason,
      time: this.simT,
      knocked: this.stats.knocked,
      wrecked: this.stats.wrecked,
      jobs: this.stats.jobs,
      bestCombo: this.stats.bestCombo,
      topSpeed: this.stats.topSpeed,
      rank: res.rank,
      id: res.id,
      list: res.list,
    });
  }

  /* ----------------------------------------------------------------- fx */
  private updateFx(dt: number) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      if (p.size < 0.3) p.size = 0.3;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      p.y -= 36 * dt;
      if (p.t > p.max) this.popups.splice(i, 1);
    }
    const sk = this.skids;
    for (let i = 0; i < sk.length; i++) sk[i].t += dt;
    while (sk.length && sk[0].t > 7) sk.shift();
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2.2) this.banner = null;
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    this.punch = Math.max(0, this.punch - dt * 0.35);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
  }

  private updateCamera(dt: number) {
    const P = this.P;
    const v = P.veh;
    const vx = v ? v.vx : P.vx;
    const vy = v ? v.vy : P.vy;
    const speed = Math.hypot(vx, vy);
    const k = 1 - Math.exp(-5.5 * dt);
    const look = 0.38;
    this.cam.x += (P.x + vx * look - this.cam.x) * k;
    this.cam.y += (P.y + vy * look - this.cam.y) * k;
    let tz = v ? 1 - Math.min(0.26, speed / 1450) - (v.boosting ? 0.07 : 0) : 1.22;
    if (this.phase === "over") tz = 1.15;
    this.cam.zoom += (tz - this.cam.zoom) * (1 - Math.exp(-3 * dt));
  }

  private audio(playing: boolean) {
    const v = this.P.veh;
    if (playing && v && !v.dead) {
      const m = MODELS[v.model];
      sfx.engine(Math.min(1.3, Math.hypot(v.vx, v.vy) / m.maxSpd), v.boosting, true);
    } else sfx.engine(0, false, false);
    if (playing) {
      let n = 0;
      for (const c of this.vehicles) if (c.ctrl === "cop" && Math.hypot(c.x - this.P.x, c.y - this.P.y) < 700) n++;
      sfx.siren(Math.min(1, n / 3));
    }
  }
}

import type { Game } from "./engine";
import { AREA, BLOCK, CELL, ROAD, TAU, clamp, getBlock, roadCenter } from "./world";
import { MODELS, M_COP, M_TAXI, M_VAN, type Vehicle } from "./types";

const FONT = '"Orbitron","Rajdhani","Arial Black",system-ui,sans-serif';
const PK = 0.0008;

/* ------------------------------------------------------------ sprites */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.35)"));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
  }
  return c;
}
const G_WARM = "rgba(255,226,150,1)";
const G_GOLD = "rgba(255,212,0,1)";
const G_PINK = "rgba(255,45,149,1)";
const G_CYAN = "rgba(0,229,255,1)";
const G_RED = "rgba(255,40,40,1)";
const G_BLUE = "rgba(60,110,255,1)";
const G_GREEN = "rgba(124,255,74,1)";

let vigKey = "";
let vigCanvas: HTMLCanvasElement | null = null;
function hurtVignette(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  if (key !== vigKey || !vigCanvas) {
    vigKey = key;
    vigCanvas = document.createElement("canvas");
    vigCanvas.width = 256;
    vigCanvas.height = Math.max(64, Math.round((256 * h) / w));
    const x = vigCanvas.getContext("2d")!;
    const g = x.createRadialGradient(128, vigCanvas.height / 2, vigCanvas.height * 0.25, 128, vigCanvas.height / 2, 150);
    g.addColorStop(0, "rgba(255,20,60,0)");
    g.addColorStop(1, "rgba(255,20,60,1)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, vigCanvas.height);
  }
  return vigCanvas;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function txt(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  weight = 800,
  outline = true,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (outline) {
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = "rgba(5,6,16,0.85)";
    ctx.lineJoin = "round";
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

/* -------------------------------------------------------------- main */
export function render(g: Game) {
  const ctx = g.ctx;
  const { W, H, dpr } = g;
  const zoom = g.cam.zoom * (1 + g.punch);
  const S = g.scale * zoom;
  const live = g.phase !== "paused";
  const sh = live ? g.trauma * g.trauma : 0;
  const ox = (Math.random() * 2 - 1) * sh * 30;
  const oy = (Math.random() * 2 - 1) * sh * 30;
  const rot = (Math.random() * 2 - 1) * sh * 0.035;
  const cx = g.cam.x;
  const cy = g.cam.y;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0c18";
  ctx.fillRect(0, 0, W, H);

  const cs = Math.cos(rot) * dpr * S;
  const sn = Math.sin(rot) * dpr * S;
  ctx.setTransform(cs, sn, -sn, cs, dpr * (W / 2 + ox), dpr * (H / 2 + oy));
  ctx.translate(-cx, -cy);

  const hw = W / 2 / S + 90;
  const hh = H / 2 / S + 90;
  const x0 = cx - hw;
  const x1 = cx + hw;
  const y0 = cy - hh;
  const y1 = cy + hh;

  drawGround(g, x0, y0, x1, y1);
  drawSkids(g);
  drawPickups(g);
  drawJob(g);
  for (const v of g.vehicles) if (v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1) drawVehicle(g, v);
  drawPeds(g, x0, y0, x1, y1);
  drawParticles(g, false);
  drawBuildings(g, x0, y0, x1, y1);
  drawParticles(g, true);
  drawPrompt(g);
  drawPopups(g);

  // ---- screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (g.hurt > 0.01) {
    ctx.globalAlpha = clamp(g.hurt, 0, 0.85);
    ctx.drawImage(hurtVignette(W, H), 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (g.flash > 0.01) {
    ctx.globalAlpha = clamp(g.flash, 0, 0.8);
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (g.P.veh && g.P.veh.boosting) speedLines(g);
  if (g.phase === "playing" || g.phase === "paused") drawHUD(g);
  if (g.stick.on) drawStick(g);
}

/* ------------------------------------------------------------ ground */
function drawGround(g: Game, x0: number, y0: number, x1: number, y1: number) {
  const ctx = g.ctx;
  ctx.fillStyle = "#151829";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const i0 = Math.floor((x0 - ROAD) / CELL);
  const i1 = Math.floor((x1 - ROAD) / CELL);
  const j0 = Math.floor((y0 - ROAD) / CELL);
  const j1 = Math.floor((y1 - ROAD) / CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const b = getBlock(i, j);
      ctx.fillStyle = "#262b47";
      ctx.fillRect(b.x, b.y, BLOCK, BLOCK);
      if (b.park) {
        ctx.fillStyle = "#0d3a2b";
        ctx.fillRect(b.x + 16, b.y + 16, AREA, AREA);
        ctx.fillStyle = "#11473a";
        ctx.fillRect(b.x + 30, b.y + 30, AREA - 28, AREA - 28);
        ctx.strokeStyle = "#2c3a50";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(b.x + 16, b.y + BLOCK / 2);
        ctx.lineTo(b.x + BLOCK - 16, b.y + BLOCK / 2);
        ctx.moveTo(b.x + BLOCK / 2, b.y + 16);
        ctx.lineTo(b.x + BLOCK / 2, b.y + BLOCK - 16);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#1a1e36";
        ctx.fillRect(b.x + 12, b.y + 12, BLOCK - 24, BLOCK - 24);
      }
      ctx.strokeStyle = "#3b4573";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, BLOCK - 2, BLOCK - 2);
    }
  }
  // lane lines
  const ri0 = Math.floor(x0 / CELL);
  const ri1 = Math.floor(x1 / CELL);
  const rj0 = Math.floor(y0 / CELL);
  const rj1 = Math.floor(y1 / CELL);
  ctx.strokeStyle = "rgba(255,196,60,0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([24, 20]);
  ctx.beginPath();
  for (let i = ri0; i <= ri1; i++) {
    const x = roadCenter(i);
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let j = rj0; j <= rj1; j++) {
    const y = roadCenter(j);
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // intersections + crosswalks + lamps
  ctx.fillStyle = "#151829";
  for (let i = ri0; i <= ri1; i++) for (let j = rj0; j <= rj1; j++) ctx.fillRect(i * CELL, j * CELL, ROAD, ROAD);
  ctx.fillStyle = "rgba(220,226,255,0.42)";
  ctx.beginPath();
  for (let i = ri0; i <= ri1; i++) {
    for (let j = rj0; j <= rj1; j++) {
      const ix = i * CELL;
      const iy = j * CELL;
      for (let k = 0; k < 7; k++) {
        const o = 10 + k * 16;
        ctx.rect(ix - 24, iy + o, 18, 8);
        ctx.rect(ix + ROAD + 6, iy + o, 18, 8);
        ctx.rect(ix + o, iy - 24, 8, 18);
        ctx.rect(ix + o, iy + ROAD + 6, 8, 18);
      }
    }
  }
  ctx.fill();
  // lamp glow
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  const gs = glow(G_WARM);
  for (let i = ri0; i <= ri1; i++) {
    for (let j = rj0; j <= rj1; j++) {
      const ix = i * CELL;
      const iy = j * CELL;
      const col = (i + j) & 1 ? glow(G_CYAN) : gs;
      for (const [lx, ly] of [
        [ix - 6, iy - 6],
        [ix + ROAD + 6, iy - 6],
        [ix - 6, iy + ROAD + 6],
        [ix + ROAD + 6, iy + ROAD + 6],
      ])
        ctx.drawImage(col, lx - 70, ly - 70, 140, 140);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawSkids(g: Game) {
  const ctx = g.ctx;
  if (!g.skids.length) return;
  ctx.lineCap = "round";
  ctx.lineWidth = 2.6;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? "rgba(4,5,12,0.22)" : "rgba(4,5,12,0.5)";
    ctx.beginPath();
    for (const s of g.skids) {
      if ((s.t > 3.5) !== (pass === 1)) continue;
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/* ----------------------------------------------------------- pickups */
function drawPickups(g: Game) {
  const ctx = g.ctx;
  const t = g.time;
  const cx = g.cam.x;
  const cy = g.cam.y;
  const vr = g.visR();
  for (const p of g.pickups) {
    if (Math.abs(p.x - cx) > vr || Math.abs(p.y - cy) > vr) continue;
    const bob = 1 + Math.sin(t * 6 + p.x * 0.05) * 0.1;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55;
    const gl = p.kind === 0 ? glow(G_GOLD) : p.kind === 1 ? glow(G_GREEN) : glow(G_CYAN);
    ctx.drawImage(gl, p.x - 24 * bob, p.y - 24 * bob, 48 * bob, 48 * bob);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (p.kind === 0) {
      const w = Math.abs(Math.cos(t * 5 + p.x * 0.1)) * 7 + 1.5;
      ctx.fillStyle = "#ffd400";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * bob, 7 * bob, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff4a8";
      ctx.beginPath();
      ctx.ellipse(p.x - 1, p.y - 1, w * 0.45, 4, 0, 0, TAU);
      ctx.fill();
    } else if (p.kind === 1) {
      ctx.fillStyle = "#0e2a1b";
      rr(ctx, p.x - 10, p.y - 10, 20, 20, 5);
      ctx.fillStyle = "#7cff4a";
      ctx.fillRect(p.x - 6, p.y - 2, 12, 4);
      ctx.fillRect(p.x - 2, p.y - 6, 4, 12);
    } else {
      ctx.fillStyle = "#06222c";
      rr(ctx, p.x - 10, p.y - 10, 20, 20, 5);
      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.moveTo(p.x + 2, p.y - 8);
      ctx.lineTo(p.x - 5, p.y + 1);
      ctx.lineTo(p.x, p.y + 1);
      ctx.lineTo(p.x - 2, p.y + 8);
      ctx.lineTo(p.x + 5, p.y - 2);
      ctx.lineTo(p.x, p.y - 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawJob(g: Game) {
  const j = g.job;
  if (!j || g.phase === "menu") return;
  const ctx = g.ctx;
  const t = g.time;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,200,0,0.06)";
  for (let k = 0; k < 9; k++) {
    const f = k / 8;
    ctx.beginPath();
    ctx.arc(j.x + (j.x - g.cam.x) * 0.45 * f, j.y + (j.y - g.cam.y) * 0.45 * f, 40 * (1 - f * 0.35), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,212,0,0.9)";
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.arc(j.x, j.y, 62 + Math.sin(t * 4) * 4, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(glow(G_GOLD), j.x - 90, j.y - 90, 180, 180);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffd400";
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = t * 2 + (i * TAU) / 4;
    ctx.lineTo(j.x + Math.cos(a) * 16, j.y + Math.sin(a) * 16);
  }
  ctx.fill();
}

/* ---------------------------------------------------------- vehicles */
function drawVehicle(g: Game, v: Vehicle) {
  const ctx = g.ctx;
  const m = MODELS[v.model];
  const L = m.len;
  const Wd = m.wid;
  const isP = v === g.pv && g.phase !== "menu";
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.a);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  rr(ctx, -L / 2 + 1, -Wd / 2 + 3.5, L + 2, Wd, 5);
  if (isP && !v.dead) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glow(G_PINK), -L * 0.8, -Wd * 1.4, L * 1.6, Wd * 2.8);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  // body
  ctx.fillStyle = v.flashT > 0 && !v.dead ? "#ffffff" : v.color;
  rr(ctx, -L / 2, -Wd / 2, L, Wd, 5);
  if (v.dead) {
    ctx.fillStyle = "#0a0a0e";
    rr(ctx, -L * 0.28, -Wd * 0.4, L * 0.4, Wd * 0.8, 3);
    ctx.fillStyle = "rgba(255,90,0,0.25)";
    rr(ctx, -L * 0.45, -Wd * 0.45, L * 0.9, Wd * 0.9, 4);
  } else {
    if (v.model === M_COP) {
      ctx.fillStyle = "#12141f";
      rr(ctx, -L * 0.3, -Wd / 2, L * 0.4, Wd, 2);
    }
    // glass + roof
    ctx.fillStyle = "#18223f";
    if (v.model === M_VAN) {
      rr(ctx, L * 0.2, -Wd * 0.4, L * 0.15, Wd * 0.8, 3);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      rr(ctx, -L * 0.45, -Wd * 0.42, L * 0.63, Wd * 0.84, 3);
    } else {
      rr(ctx, L * 0.08, -Wd * 0.4, L * 0.17, Wd * 0.8, 3);
      rr(ctx, -L * 0.38, -Wd * 0.38, L * 0.1, Wd * 0.76, 2);
      ctx.fillStyle = v.model === M_COP ? "#1d2238" : "rgba(255,255,255,0.2)";
      rr(ctx, -L * 0.26, -Wd * 0.4, L * 0.33, Wd * 0.8, 3);
    }
    if (isP) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(-L / 2 + 2, -1.2, L - 4, 0.9);
      ctx.fillRect(-L / 2 + 2, 0.5, L - 4, 0.9);
    }
    if (v.model === M_TAXI) {
      ctx.fillStyle = "#fff6b0";
      rr(ctx, -4, -4, 8, 8, 2);
    }
    // lights
    ctx.fillStyle = "#fff7c2";
    ctx.fillRect(L / 2 - 4, -Wd * 0.38, 4, 4);
    ctx.fillRect(L / 2 - 4, Wd * 0.38 - 4, 4, 4);
    ctx.fillStyle = v.braking ? "#ff4646" : "#8a1a24";
    ctx.fillRect(-L / 2, -Wd * 0.4, 2.5, 4);
    ctx.fillRect(-L / 2, Wd * 0.4 - 4, 2.5, 4);
    // glows
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.34;
    ctx.drawImage(glow(G_WARM), L / 2 - 4, -Wd * 1.1, 96, Wd * 2.2);
    if (v.braking) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(glow(G_RED), -L / 2 - 14, -Wd * 0.9, 26, Wd * 1.8);
    }
    if (v.model === M_COP) {
      const f = Math.floor(g.time * 8 + v.id) % 2 === 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = f ? "#ff2a3a" : "#2a5bff";
      ctx.fillRect(-3, -Wd * 0.38, 6, Wd * 0.38);
      ctx.fillStyle = f ? "#2a5bff" : "#ff2a3a";
      ctx.fillRect(-3, 0, 6, Wd * 0.38);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glow(f ? G_RED : G_BLUE), -34, -Wd * 1.6 - 6, 68, Wd * 1.6);
      ctx.drawImage(glow(f ? G_BLUE : G_RED), -34, 6, 68, Wd * 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

/* -------------------------------------------------------------- peds */
function drawPeds(g: Game, x0: number, y0: number, x1: number, y1: number) {
  const ctx = g.ctx;
  for (const p of g.peds) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const z = p.z;
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, 0.35 - z * 0.004)})`;
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + 2, 5, 4, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y - z * 0.45);
    const sc = 1 + z / 110;
    ctx.scale(sc, sc);
    ctx.rotate(p.a);
    const stride = Math.sin(p.t * (p.state === 1 ? 18 : 9)) * 2;
    if (p.state !== 2) {
      ctx.fillStyle = "#101428";
      ctx.fillRect(-1 + stride * 0.5, -3.5, 3, 2);
      ctx.fillRect(-1 - stride * 0.5, 1.5, 3, 2);
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 5.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#f6d3b0";
    ctx.beginPath();
    ctx.arc(0.8, 0, 2.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2b2140";
    ctx.beginPath();
    ctx.arc(0, 0, 2.7, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.restore();
  }
  // player on foot
  const P = g.P;
  if (!P.veh && g.phase !== "menu") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(P.x + 1, P.y + 3, 7, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glow(G_PINK), P.x - 24, P.y - 24, 48, 48);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(P.a);
    const st = Math.sin(P.walk * 2) * 3;
    ctx.fillStyle = "#101428";
    ctx.fillRect(-1 + st * 0.5, -4.5, 4, 2.5);
    ctx.fillRect(-1 - st * 0.5, 2, 4, 2.5);
    ctx.fillStyle = "#ff2d95";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#f6d3b0";
    ctx.beginPath();
    ctx.arc(1, 0, 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#13131f";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.restore();
  }
}

/* --------------------------------------------------------- particles */
function drawParticles(g: Game, additive: boolean) {
  const ctx = g.ctx;
  const parts = g.parts;
  ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.add !== additive) continue;
    const k = p.life / p.max;
    switch (p.kind) {
      case 0:
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
        break;
      case 1:
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        break;
      case 2:
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        break;
      case 3:
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
        break;
      case 4:
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + k * 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawPopups(g: Game) {
  const ctx = g.ctx;
  for (const p of g.popups) {
    const k = p.t / p.max;
    const pop = 1 + Math.max(0, 1 - p.t / 0.18) * 0.7;
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    txt(ctx, p.text, p.x, p.y, p.size * pop, p.color, "center", 900);
  }
  ctx.globalAlpha = 1;
}

function drawPrompt(g: Game) {
  const v = g.nearVeh;
  if (!v || g.P.veh || g.phase !== "playing") return;
  const ctx = g.ctx;
  const y = v.y - 34 + Math.sin(g.time * 6) * 2;
  ctx.fillStyle = "rgba(10,12,28,0.85)";
  rr(ctx, v.x - 20, y - 12, 40, 24, 8);
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(v.x - 20, y - 12, 40, 24, 8);
  ctx.stroke();
  txt(ctx, g.touchMode ? "TAP" : "E", v.x, y, 13, "#00e5ff", "center", 900, false);
}

/* --------------------------------------------------------- buildings */
function drawBuildings(g: Game, x0: number, y0: number, x1: number, y1: number) {
  const ctx = g.ctx;
  const cx = g.cam.x;
  const cy = g.cam.y;
  const i0 = Math.floor((x0 - ROAD - 100) / CELL);
  const i1 = Math.floor((x1 - ROAD + 100) / CELL);
  const j0 = Math.floor((y0 - ROAD - 100) / CELL);
  const j1 = Math.floor((y1 - ROAD + 100) / CELL);
  const glows: { x: number; y: number; w: number; h: number; c: string; s: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const b = getBlock(i, j);
      if (b.park) {
        for (const t of b.trees) {
          const px = t.x + (t.x - cx) * 0.035;
          const py = t.y + (t.y - cy) * 0.035;
          if (px < x0 - 30 || px > x1 + 30 || py < y0 - 30 || py > y1 + 30) continue;
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.beginPath();
          ctx.arc(t.x + 4, t.y + 6, t.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#0b4a35";
          ctx.beginPath();
          ctx.arc(px, py, t.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#16694b";
          ctx.beginPath();
          ctx.arc(px - t.r * 0.2, py - t.r * 0.25, t.r * 0.6, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#34d6a0";
          ctx.beginPath();
          ctx.arc(px - t.r * 0.35, py - t.r * 0.4, t.r * 0.18, 0, TAU);
          ctx.fill();
        }
        continue;
      }
      for (const bd of b.buildings) {
        const ox = (bd.cx - cx) * bd.height * PK;
        const oy = (bd.cy - cy) * bd.height * PK;
        if (bd.x + ox > x1 || bd.x + bd.w + ox < x0 || bd.y + oy > y1 || bd.y + bd.h + oy < y0) {
          if (bd.x > x1 || bd.x + bd.w < x0 || bd.y > y1 || bd.y + bd.h < y0) continue;
        }
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(bd.x + 6, bd.y + 8, bd.w, bd.h);
        for (let k = 0; k < 4; k++) {
          const t = k / 3;
          ctx.fillStyle = bd.layers[k];
          ctx.fillRect(bd.x + ox * t, bd.y + oy * t, bd.w, bd.h);
        }
        const rx = bd.x + ox;
        const ry = bd.y + oy;
        // roof detail
        ctx.strokeStyle = "rgba(160,175,255,0.18)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 5, ry + 5, bd.w - 10, bd.h - 10);
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        const ax = rx + bd.w * (0.14 + bd.seed * 0.5);
        const ay = ry + bd.h * (0.18 + ((bd.seed * 7) % 1) * 0.5);
        ctx.fillRect(ax, ay, 22, 16);
        ctx.fillRect(rx + bd.w * 0.7, ry + bd.h * 0.62, 14, 14);
        ctx.fillStyle = bd.accent;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(ax + 3, ay + 3, 3, 3);
        ctx.globalAlpha = 1;
        if (bd.sign) glows.push({ x: rx, y: ry, w: bd.w, h: bd.h, c: bd.accent, s: bd.sign });
        else {
          ctx.strokeStyle = bd.accent;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rx + 0.5, ry + 0.5, bd.w - 1, bd.h - 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  // neon signs along roof edges (additive)
  if (glows.length) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const n of glows) {
      const pts: number[] =
        n.s === 1 ? [n.x, n.y, n.x + n.w, n.y] : n.s === 2 ? [n.x + n.w, n.y, n.x + n.w, n.y + n.h] : n.s === 3 ? [n.x, n.y + n.h, n.x + n.w, n.y + n.h] : [n.x, n.y, n.x, n.y + n.h];
      ctx.strokeStyle = n.c;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.lineTo(pts[2], pts[3]);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

/* --------------------------------------------------------- screen fx */
function speedLines(g: Game) {
  const ctx = g.ctx;
  const { W, H } = g;
  ctx.strokeStyle = "rgba(160,240,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * TAU;
    const r0 = Math.min(W, H) * (0.3 + Math.random() * 0.2);
    const r1 = r0 + 60 + Math.random() * 120;
    ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
    ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
  }
  ctx.stroke();
}

function drawStick(g: Game) {
  const ctx = g.ctx;
  const s = g.stick;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#0a0c1c";
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s.ox, s.oy, 58, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(s.ox + s.x * 58, s.oy + s.y * 58, 24, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------- HUD */
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string) {
  ctx.fillStyle = "rgba(8,10,24,0.78)";
  rr(ctx, x - 2, y - 2, w + 4, h + 4, h);
  ctx.fillStyle = color;
  if (f > 0.01) rr(ctx, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  if (f > 0.01) rr(ctx, x + 2, y + 1, Math.max(h - 4, w * clamp(f, 0, 1) - 4), h * 0.32, h);
}

function drawHUD(g: Game) {
  const ctx = g.ctx;
  const { W, H } = g;
  const u = clamp(Math.min(W, H) / 560, 0.78, 1.25);
  const P = g.P;

  // --- score
  const bump = 1 + g.scoreBump * 0.28;
  txt(ctx, "CASH", 16 * u, 18 * u, 11 * u, "#00e5ff", "left", 800);
  ctx.save();
  ctx.translate(16 * u, 44 * u);
  ctx.scale(bump, bump);
  txt(ctx, Math.round(g.score).toLocaleString(), 0, 0, 30 * u, "#ffffff", "left", 900);
  ctx.restore();
  // combo
  if (g.combo > 0) {
    const f = clamp(g.comboT / 3.4, 0, 1);
    const col = g.mult >= 6 ? "#ff2d95" : g.mult >= 3 ? "#ffd400" : "#7cff4a";
    txt(ctx, `x${g.mult}`, 16 * u, 76 * u, 22 * u * (1 + g.scoreBump * 0.2), col, "left", 900);
    bar(ctx, 62 * u, 71 * u, 110 * u, 8 * u, f, col);
    txt(ctx, `${g.combo} CHAIN`, 62 * u, 92 * u, 10 * u, "#cfd6ff", "left", 700);
  } else txt(ctx, `BEST ${g.best.toLocaleString()}`, 16 * u, 74 * u, 11 * u, "#8f99d6", "left", 700);
  // job
  if (g.job) {
    const d = Math.hypot(g.job.x - P.x, g.job.y - P.y);
    const t = Math.max(0, g.job.t);
    const y = g.combo > 0 ? 112 * u : 98 * u;
    txt(ctx, "DELIVERY", 16 * u, y, 10 * u, "#ffd400", "left", 800);
    txt(ctx, `${Math.round(d / 10)}m   ${t > 0 ? t.toFixed(0) + "s" : "LATE"}`, 16 * u, y + 17 * u, 14 * u, t > 8 ? "#fff" : "#ff5d5d", "left", 800);
    jobArrow(g, u);
  }

  // --- wanted stars
  const sx = W / 2;
  const fl = Math.floor(g.time * 6) % 2 === 0;
  for (let i = 0; i < 5; i++) {
    const x = sx + (i - 2) * 26 * u;
    const y = 24 * u;
    const lit = i < Math.floor(g.heat);
    const part = i === Math.floor(g.heat) ? g.heat - Math.floor(g.heat) : 0;
    star(ctx, x, y, 11 * u);
    ctx.fillStyle = "rgba(10,12,28,0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160,170,230,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (lit || part > 0) {
      ctx.globalAlpha = lit ? 1 : 0.25 + part * 0.6;
      star(ctx, x, y, 10 * u);
      ctx.fillStyle = lit ? (fl ? "#ff2d4f" : "#4d7bff") : "#ff2d95";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  let ty = 50 * u;
  if (g.heat > 0 && g.evadeT > 0.1) {
    txt(ctx, "EVADING...", sx, ty, 11 * u, "#00e5ff", "center", 800);
    ty += 16 * u;
  }
  if (g.bust > 0.02) {
    const w = 150 * u;
    bar(ctx, sx - w / 2, ty, w, 10 * u, g.bust, fl ? "#ff2d4f" : "#4d7bff");
    txt(ctx, "BUSTED!", sx, ty + 22 * u, 11 * u, "#fff", "center", 900);
    ty += 34 * u;
  }
  if (g.burning) {
    ctx.globalAlpha = fl ? 1 : 0.5;
    txt(ctx, "ENGINE ON FIRE!", sx, ty + 4 * u, 14 * u, "#ff6a2d", "center", 900);
    txt(ctx, "BAIL OUT (E) OR FIND A REPAIR", sx, ty + 22 * u, 10 * u, "#ffd9a0", "center", 700);
    ctx.globalAlpha = 1;
  }

  // --- minimap (below the pause/mute buttons)
  const mr = 50 * u;
  drawMinimap(g, W - mr - 14 * u, 62 * u + mr, mr);

  // --- bottom bars
  const bw = Math.min(240 * u, W * 0.4);
  const bx = W / 2 - bw / 2;
  const by = H - 54 * u;
  const v = P.veh;
  if (v) {
    const f = v.hp / v.maxHp;
    const col = f > 0.55 ? "#7cff4a" : f > 0.28 ? "#ffd400" : "#ff3b3b";
    txt(ctx, MODELS[v.model].name, bx, by - 12 * u, 10 * u, "#cfd6ff", "left", 800);
    txt(ctx, `${Math.round(Math.hypot(v.vx, v.vy) * 0.42)} KM/H`, bx + bw, by - 12 * u, 11 * u, "#fff", "right", 800);
    bar(ctx, bx, by, bw, 10 * u, f, col);
    bar(ctx, bx, by + 18 * u, bw, 7 * u, g.nitro / 100, "#00e5ff");
    txt(ctx, "NITRO", bx - 8 * u, by + 21 * u, 8 * u, "#00e5ff", "right", 800);
  } else {
    txt(ctx, "ON FOOT", bx, by - 12 * u, 10 * u, "#cfd6ff", "left", 800);
    bar(ctx, bx, by, bw, 10 * u, P.hp / 100, "#ff2d95");
    txt(ctx, g.nearVeh ? (g.touchMode ? "TAP ENTER TO STEAL CAR" : "PRESS E TO STEAL CAR") : "FIND A CAR", bx + bw / 2, by + 28 * u, 11 * u, g.nearVeh ? "#00e5ff" : "#8f99d6", "center", 800);
  }

  // --- banner
  const b = g.banner;
  if (b) {
    const k = b.t;
    const sc = 1 + Math.max(0, 0.25 - k) * 4;
    const a = k > 1.7 ? Math.max(0, (2.2 - k) / 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.27);
    ctx.scale(sc, sc);
    txt(ctx, b.text, 0, 0, Math.min(46 * u, W / 14), b.color, "center", 900);
    txt(ctx, b.sub, 0, 30 * u, 12 * u, "#e5e9ff", "center", 700);
    ctx.restore();
  }
  // --- hints
  if (g.hintT > 0 && g.phase === "playing") {
    ctx.globalAlpha = Math.min(1, g.hintT / 2);
    const lines = g.touchMode
      ? ["DRAG LEFT SIDE TO STEER · NITRO / DRIFT BUTTONS ON THE RIGHT"]
      : ["WASD / ARROWS DRIVE · SPACE DRIFT · SHIFT NITRO · E ENTER / EXIT CAR"];
    txt(ctx, lines[0], W / 2, H - 100 * u, 11 * u, "#ffffff", "center", 800);
    ctx.globalAlpha = 1;
  }
}

function jobArrow(g: Game, u: number) {
  const j = g.job;
  if (!j) return;
  const ctx = g.ctx;
  const { W, H } = g;
  const S = g.scale * g.cam.zoom;
  const sx = W / 2 + (j.x - g.cam.x) * S;
  const sy = H / 2 + (j.y - g.cam.y) * S;
  const m = 46 * u;
  if (sx > m && sx < W - m && sy > m + 40 && sy < H - m) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const ex = clamp(W / 2 + Math.cos(a) * W, m, W - m);
  const ey = clamp(H / 2 + Math.sin(a) * H, m + 50 * u, H - m - 40 * u);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  const pulse = 1 + Math.sin(g.time * 8) * 0.12;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "#ffd400";
  ctx.strokeStyle = "rgba(5,6,16,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16 * u, 0);
  ctx.lineTo(-10 * u, -12 * u);
  ctx.lineTo(-4 * u, 0);
  ctx.lineTo(-10 * u, 12 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function drawMinimap(g: Game, mx: number, my: number, r: number) {
  const ctx = g.ctx;
  const P = g.P;
  const range = 950;
  const k = r / range;
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, TAU);
  ctx.fillStyle = "rgba(8,10,26,0.82)";
  ctx.fill();
  ctx.clip();
  ctx.translate(mx, my);
  ctx.strokeStyle = "#3a4274";
  ctx.lineWidth = Math.max(2, ROAD * k * 0.8);
  ctx.beginPath();
  const i0 = Math.floor((P.x - range) / CELL);
  const i1 = Math.floor((P.x + range) / CELL);
  for (let i = i0; i <= i1; i++) {
    const x = (roadCenter(i) - P.x) * k;
    ctx.moveTo(x, -r);
    ctx.lineTo(x, r);
  }
  const j0 = Math.floor((P.y - range) / CELL);
  const j1 = Math.floor((P.y + range) / CELL);
  for (let j = j0; j <= j1; j++) {
    const y = (roadCenter(j) - P.y) * k;
    ctx.moveTo(-r, y);
    ctx.lineTo(r, y);
  }
  ctx.stroke();
  const fl = Math.floor(g.time * 6) % 2 === 0;
  for (const v of g.vehicles) {
    if (v.ctrl !== "cop" || v.dead) continue;
    const x = (v.x - P.x) * k;
    const y = (v.y - P.y) * k;
    ctx.fillStyle = fl ? "#ff2d4f" : "#4d7bff";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TAU);
    ctx.fill();
  }
  if (g.job) {
    let x = (g.job.x - P.x) * k;
    let y = (g.job.y - P.y) * k;
    const d = Math.hypot(x, y);
    if (d > r - 6) {
      x = (x / d) * (r - 6);
      y = (y / d) * (r - 6);
    }
    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fill();
  }
  ctx.rotate(P.a);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, TAU);
  ctx.stroke();
}

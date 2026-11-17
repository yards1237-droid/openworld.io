import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Result } from "../game/types";
import { getName, renameScore, type ScoreEntry } from "../game/storage";

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function NeonButton({
  children,
  onClick,
  tone = "pink",
  hint,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "pink" | "cyan" | "dim";
  hint?: string;
  className?: string;
}) {
  const tones = {
    pink: "bg-[#ff2d95] text-white shadow-[0_0_28px_rgba(255,45,149,0.65)] hover:shadow-[0_0_44px_rgba(255,45,149,0.95)]",
    cyan: "bg-[#00e5ff] text-[#06101c] shadow-[0_0_24px_rgba(0,229,255,0.55)] hover:shadow-[0_0_40px_rgba(0,229,255,0.9)]",
    dim: "bg-white/10 text-white/90 border border-white/20 hover:bg-white/20",
  };
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-xl px-6 py-3.5 font-display text-sm sm:text-base font-black tracking-[0.18em] uppercase transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer ${tones[tone]} ${className}`}
    >
      {children}
      {hint && <span className="ml-3 hidden sm:inline rounded bg-black/25 px-2 py-0.5 text-[10px] tracking-widest opacity-80">{hint}</span>}
    </button>
  );
}

export function ScoreTable({
  list,
  highlightId,
  onRename,
  compact,
}: {
  list: ScoreEntry[];
  highlightId?: string;
  onRename?: (name: string) => void;
  compact?: boolean;
}) {
  const [name, setName] = useState(getName());
  const rows = Array.from({ length: compact ? 5 : 8 }, (_, i) => list[i]);
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black/40 p-3 sm:p-4 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between font-display text-[10px] tracking-[0.3em] text-cyan-300/90">
        <span>HIGH SCORES</span>
        <span className="text-white/40">LOCAL</span>
      </div>
      <ol className="space-y-1">
        {rows.map((e, i) => {
          const me = e && e.id === highlightId;
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-1 font-display text-xs sm:text-sm ${
                me ? "bg-[#ff2d95]/25 ring-1 ring-[#ff2d95] text-white" : "text-white/75"
              }`}
            >
              <span className={`w-5 text-right ${i === 0 ? "text-yellow-300" : "text-white/40"}`}>{i + 1}</span>
              {me && onRename ? (
                <input
                  value={name}
                  maxLength={10}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(ev) => {
                    const v = ev.target.value.toUpperCase();
                    setName(v);
                    onRename(v);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                  }}
                  onFocus={(ev) => ev.target.select()}
                  className="min-w-0 flex-1 rounded bg-black/50 px-1.5 py-0.5 font-display tracking-widest text-[#ffe066] outline-none ring-1 ring-white/25 focus:ring-[#00e5ff]"
                  aria-label="Your name"
                />
              ) : (
                <span className="flex-1 truncate tracking-widest">{e ? e.name : "- - -"}</span>
              )}
              <span className="tabular-nums text-yellow-200">{e ? e.score.toLocaleString() : "0"}</span>
              {!compact && <span className="hidden w-10 text-right text-[10px] text-white/35 sm:block">{e ? fmtTime(e.time) : ""}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StartScreen({ onStart, scores, touch }: { onStart: () => void; scores: ScoreEntry[]; touch: boolean }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-gradient-to-b from-[#07091a]/80 via-[#07091a]/45 to-[#07091a]/85 p-4">
      <div className="flex w-full max-w-4xl flex-col items-center gap-5 py-4 md:flex-row md:items-center md:gap-10">
        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left animate-[rise_.7s_ease-out_both]">
          <div className="mb-2 font-display text-[10px] sm:text-xs tracking-[0.55em] text-cyan-300">OPEN CITY · NO RULES</div>
          <h1 className="neon-title font-display text-5xl sm:text-7xl font-black leading-[0.9] italic">
            NEON
            <br />
            OUTLAW
          </h1>
          <p className="mt-4 max-w-sm text-sm text-indigo-100/80">
            Steal a ride. Grab the cash. Smash the traffic. Deliver the goods — and don't let the cops pin you down.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <NeonButton onClick={onStart} hint="ENTER">
              {touch ? "TAP TO DRIVE" : "START ENGINE"}
            </NeonButton>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-indigo-100/70">
            {touch ? (
              <>
                <Key k="DRAG LEFT">steer & throttle</Key>
                <Key k="NITRO">hold to boost</Key>
                <Key k="DRIFT">hold to slide</Key>
                <Key k="ENTER">steal / exit car</Key>
              </>
            ) : (
              <>
                <Key k="WASD / ↑↓←→">drive</Key>
                <Key k="SPACE">handbrake drift</Key>
                <Key k="SHIFT">nitro boost</Key>
                <Key k="E">enter / exit car</Key>
                <Key k="P / ESC">pause</Key>
                <Key k="R">instant restart</Key>
              </>
            )}
          </div>
        </div>
        <div className="w-full max-w-sm animate-[rise_.9s_.15s_ease-out_both]">
          <ScoreTable list={scores} compact />
        </div>
      </div>
    </div>
  );
}

function Key({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded border border-cyan-300/40 bg-cyan-300/10 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wider text-cyan-200">{k}</span>
      <span>{children}</span>
    </div>
  );
}

export function PauseMenu({
  onResume,
  onRestart,
  onMenu,
  muted,
  onMute,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#05060f]/70 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/15 bg-[#0b0d22]/90 p-6 text-center animate-[rise_.25s_ease-out_both]">
        <div className="neon-title font-display text-3xl font-black italic">PAUSED</div>
        <NeonButton onClick={onResume} tone="cyan" hint="P">
          Resume
        </NeonButton>
        <NeonButton onClick={onRestart} hint="R">
          Restart
        </NeonButton>
        <NeonButton onClick={onMute} tone="dim">
          Sound: {muted ? "Off" : "On"}
        </NeonButton>
        <NeonButton onClick={onMenu} tone="dim">
          Main menu
        </NeonButton>
      </div>
    </div>
  );
}

function useCountUp(target: number, ms = 1100, delay = 600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}

export function GameOver({ result, onRestart, onMenu }: { result: Result; onRestart: () => void; onMenu: () => void }) {
  const [list, setList] = useState(result.list);
  const shown = useCountUp(result.score);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setList(result.list), [result]);
  const busted = result.reason === "BUSTED";
  const newBest = result.rank === 0;
  return (
    <div ref={ref} className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#05060f]/65 p-3 sm:p-4 backdrop-blur-[3px] animate-[fade_.7s_.55s_ease-out_both]">
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 py-2 md:flex-row md:items-stretch">
        <div className="flex w-full flex-1 flex-col items-center rounded-3xl border border-white/10 bg-black/40 p-5 text-center">
          <div className={`font-display text-4xl sm:text-5xl font-black italic ${busted ? "text-[#6d8bff] drop-shadow-[0_0_18px_rgba(77,107,255,.9)]" : "text-[#ff2d95] drop-shadow-[0_0_18px_rgba(255,45,149,.9)]"}`}>
            {result.reason}
          </div>
          <div className="mt-1 text-xs tracking-[0.3em] text-white/50">{busted ? "THE LAW CAUGHT UP" : "THE STREETS WIN THIS ROUND"}</div>
          <div className="mt-4 font-display text-[10px] tracking-[0.4em] text-cyan-300">FINAL CASH</div>
          <div className="font-display text-5xl sm:text-6xl font-black tabular-nums text-white drop-shadow-[0_0_14px_rgba(255,255,255,.4)]">{shown.toLocaleString()}</div>
          {newBest && <div className="mt-1 animate-pulse font-display text-sm font-black tracking-[0.3em] text-yellow-300">★ NEW HIGH SCORE ★</div>}
          <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
            <Stat l="Knockdowns" v={result.knocked} />
            <Stat l="Wrecks" v={result.wrecked} />
            <Stat l="Deliveries" v={result.jobs} />
            <Stat l="Best chain" v={`x${result.bestCombo}`} />
            <Stat l="Top speed" v={`${Math.round(result.topSpeed * 0.42)}`} />
            <Stat l="Time" v={fmtTime(result.time)} />
          </div>
          <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <NeonButton onClick={onRestart} hint="R / ENTER" className="flex-1">
              Drive again
            </NeonButton>
            <NeonButton onClick={onMenu} tone="dim">
              Menu
            </NeonButton>
          </div>
        </div>
        <div className="w-full md:max-w-xs">
          <ScoreTable
            list={list}
            highlightId={result.rank >= 0 ? result.id : undefined}
            onRename={result.rank >= 0 ? (n) => setList(renameScore(result.id, n)) : undefined}
          />
          {result.rank >= 0 && <div className="mt-2 text-center text-[10px] tracking-widest text-white/40">TAP YOUR NAME TO EDIT IT</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="font-display text-lg font-black text-white">{v}</div>
      <div className="text-[9px] uppercase tracking-widest text-white/45">{l}</div>
    </div>
  );
}

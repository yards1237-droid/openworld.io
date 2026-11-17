import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import { sfx } from "./game/audio";
import { getScores } from "./game/storage";
import type { Phase, Result } from "./game/types";
import { GameOver, PauseMenu, StartScreen } from "./components/Overlays";
import { TouchControls } from "./components/TouchControls";

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={(e) => {
        onClick();
        (e.currentTarget as HTMLElement).blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-[#0a0c1e]/70 text-white backdrop-blur transition hover:border-[#00e5ff] hover:text-[#00e5ff] active:scale-90 cursor-pointer"
    >
      {children}
    </button>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [muted, setMuted] = useState(sfx.muted);
  const [scores, setScores] = useState(getScores());
  const [touch, setTouch] = useState(false);
  const [inCar, setInCar] = useState(true);

  useEffect(() => {
    const g = new Game(canvasRef.current!);
    gameRef.current = g;
    g.onPhase = (p, r) => {
      setPhase(p);
      if (r) setResult(r);
      if (p === "menu" || p === "over") setScores(getScores());
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
    setTouch(g.touchMode);
    const id = window.setInterval(() => {
      setTouch((t) => (t !== g.touchMode ? g.touchMode : t));
      setInCar((c) => (c !== !!g.P.veh ? !!g.P.veh : c));
    }, 250);
    return () => {
      window.clearInterval(id);
      g.dispose();
    };
  }, []);

  const g = () => gameRef.current!;
  const toggleMute = useCallback(() => {
    sfx.setMuted(!sfx.muted);
    setMuted(sfx.muted);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setMuted(sfx.muted);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playing = phase === "playing" || phase === "paused";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0c18] text-white select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {/* cinematic vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(4,5,14,0.65)_100%)]" />

      {playing && (
        <div className="absolute right-3 top-3 z-10 flex gap-2" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <IconBtn onClick={toggleMute} label="Toggle sound">
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5z" />
                <path d="m22 9-6 6M16 9l6 6" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            )}
          </IconBtn>
          <IconBtn onClick={() => g().togglePause()} label="Pause">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              {phase === "paused" ? <path d="M7 4v16l13-8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
            </svg>
          </IconBtn>
        </div>
      )}

      {phase === "playing" && touch && <TouchControls game={g()} inCar={inCar} />}

      {phase === "menu" && <StartScreen onStart={() => g().start()} scores={scores} touch={touch} />}
      {phase === "paused" && (
        <PauseMenu
          onResume={() => g().togglePause()}
          onRestart={() => g().start()}
          onMenu={() => g().toMenu()}
          muted={muted}
          onMute={toggleMute}
        />
      )}
      {phase === "over" && result && <GameOver result={result} onRestart={() => g().start()} onMenu={() => g().toMenu()} />}
    </div>
  );
}

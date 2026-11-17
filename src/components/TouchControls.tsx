import { useRef, type ReactNode } from "react";
import type { Game } from "../game/engine";

function HoldButton({
  onDown,
  onUp,
  className,
  children,
}: {
  onDown: () => void;
  onUp: () => void;
  className: string;
  children: ReactNode;
}) {
  const active = useRef(false);
  const end = () => {
    if (active.current) {
      active.current = false;
      onUp();
    }
  };
  return (
    <button
      className={`pointer-events-auto select-none touch-none rounded-full font-display font-black tracking-widest backdrop-blur-sm active:scale-90 transition-transform ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        active.current = true;
        onDown();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export function TouchControls({ game, inCar }: { game: Game; inCar: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="absolute bottom-5 right-4 flex items-end gap-3 sm:bottom-8 sm:right-8">
        <div className="flex flex-col items-center gap-3">
          <HoldButton
            onDown={() => game.press("action")}
            onUp={() => {}}
            className="h-16 w-16 border-2 border-white/60 bg-white/15 text-[10px] text-white shadow-[0_0_16px_rgba(255,255,255,.3)]"
          >
            {inCar ? "EXIT" : "ENTER"}
          </HoldButton>
          <HoldButton
            onDown={() => (game.btn.brake = true)}
            onUp={() => (game.btn.brake = false)}
            className="h-[72px] w-[72px] border-2 border-[#ffd400] bg-[#ffd400]/20 text-[11px] text-[#ffe066] shadow-[0_0_18px_rgba(255,212,0,.45)]"
          >
            DRIFT
          </HoldButton>
        </div>
        <HoldButton
          onDown={() => (game.btn.nitro = true)}
          onUp={() => (game.btn.nitro = false)}
          className="mb-1 h-24 w-24 border-2 border-[#00e5ff] bg-[#00e5ff]/20 text-sm text-[#7ff3ff] shadow-[0_0_24px_rgba(0,229,255,.6)]"
        >
          NITRO
        </HoldButton>
      </div>
    </div>
  );
}

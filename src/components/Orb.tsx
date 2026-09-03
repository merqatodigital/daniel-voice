"use client";

type Props = {
  state: "idle" | "live" | "listening" | "thinking" | "speaking";
  onTap: () => void;
  label: string;
};

const COLORS: Record<Props["state"], string> = {
  idle: "from-cyan-500/30 to-sky-700/20",
  live: "from-emerald-400/35 to-teal-700/25",
  listening: "from-emerald-400/40 to-cyan-600/30",
  thinking: "from-amber-400/40 to-orange-600/25",
  speaking: "from-sky-300/50 to-cyan-600/30",
};

export default function Orb({ state, onTap, label }: Props) {
  const active = state !== "idle";
  return (
    <button
      onClick={onTap}
      aria-label={label}
      className="relative mx-auto flex h-40 w-40 items-center justify-center outline-none"
    >
      <span className="ring-a absolute inset-0 rounded-full border border-cyan-400/30 border-t-cyan-300/80" />
      <span className="ring-b absolute inset-3 rounded-full border border-sky-400/20 border-b-sky-300/70 border-dashed" />
      <span
        className={`orb-core ${active ? "active" : ""} absolute inset-7 rounded-full bg-gradient-to-br ${COLORS[state]} shadow-[0_0_60px_-5px_rgba(34,211,238,0.6)]`}
      />
      <span className="absolute inset-12 rounded-full bg-[#04070d]/70 backdrop-blur-sm" />
      <span className="relative z-10 flex flex-col items-center">
        {state === "listening" || state === "speaking" ? (
          <span className="eq flex h-8 items-end gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-cyan-300"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </span>
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-200 hud-text">
            {state === "thinking" ? "···" : "tap"}
          </span>
        )}
        <span className="mt-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">
          {label}
        </span>
      </span>
    </button>
  );
}

"use client";

import { useState } from "react";
import { ATTITUDE_LIST } from "@/lib/personas";
import VoiceLab from "@/components/VoiceLab";
import ModelPicker from "@/components/ModelPicker";
import type { ClientSettings } from "@/lib/clientTypes";

type Props = {
  settings: ClientSettings;
  onChange: (patch: Partial<ClientSettings>) => void;
  onSave: () => Promise<void>;
};

const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => (
  <label className="block">
    <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">{label}</span>
    <div className="mt-1.5">{children}</div>
    {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
  </label>
);

const input =
  "w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60";

export default function SettingsPanel({ settings, onChange, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-5 pb-28">
      <section className="glass rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Identity</h2>
        <Field label="Call me">
          <input
            className={input}
            value={settings.userName}
            onChange={(e) => onChange({ userName: e.target.value })}
            placeholder="Sir"
          />
        </Field>
        <Field label="Assistant name">
          <input
            className={input}
            value={settings.agentName}
            onChange={(e) => onChange({ agentName: e.target.value })}
            placeholder="TALA"
          />
        </Field>
      </section>

      <section className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Attitude</h2>
        <div className="grid grid-cols-2 gap-2">
          {ATTITUDE_LIST.map((p) => {
            const on = settings.attitude === p.key;
            return (
              <button
                key={p.key}
                onClick={() => onChange({ attitude: p.key })}
                className={`rounded-xl border p-3 text-left transition ${
                  on
                    ? "border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_24px_-8px_rgba(34,211,238,0.8)]"
                    : "border-slate-700/60 bg-slate-950/40"
                }`}
              >
                <div className="text-base">{p.emoji}</div>
                <div className="text-sm font-medium text-slate-100">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{p.blurb}</div>
              </button>
            );
          })}
          <button
            onClick={() => onChange({ attitude: "custom" })}
            className={`col-span-2 rounded-xl border p-3 text-left transition ${
              settings.attitude === "custom"
                ? "border-cyan-400/70 bg-cyan-400/10"
                : "border-slate-700/60 bg-slate-950/40"
            }`}
          >
            <div className="text-sm font-medium text-slate-100">🧬 Custom personality</div>
            <div className="text-[11px] text-slate-400">Write your own behaviour prompt.</div>
          </button>
        </div>
        {settings.attitude === "custom" && (
          <Field label="Personality prompt">
            <textarea
              className={`${input} h-28 resize-none`}
              value={settings.customAttitude}
              onChange={(e) => onChange({ customAttitude: e.target.value })}
              placeholder="You are a laid-back surf-instructor AI who explains everything with ocean metaphors..."
            />
          </Field>
        )}
      </section>

      <section className="glass rounded-2xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Conversation</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            How the microphone behaves once you tap the orb.
          </p>
        </div>

        <div className="space-y-2">
          {(
            [
              {
                key: "continuous",
                emoji: "🔁",
                label: "Continuous (hands-free)",
                blurb: "Stays open after every reply. Say \u201Cstop conversation\u201D or tap the orb to end.",
              },
              {
                key: "wake",
                emoji: "🗣️",
                label: "Wake word",
                blurb: "Listens constantly but only answers when you say the wake word.",
              },
              {
                key: "tap",
                emoji: "👆",
                label: "One shot",
                blurb: "Single exchange, then the mic closes itself. Best for battery.",
              },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => onChange({ listenMode: m.key })}
              className={`w-full rounded-xl border p-3 text-left transition ${
                settings.listenMode === m.key
                  ? "border-cyan-400/70 bg-cyan-400/10"
                  : "border-slate-700/60 bg-slate-950/40"
              }`}
            >
              <div className="text-sm font-medium text-slate-100">
                {m.emoji} {m.label}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{m.blurb}</p>
            </button>
          ))}
        </div>

        {settings.listenMode === "wake" && (
          <Field label="Wake word" hint="Also answers to the assistant's own name.">
            <input
              className={input}
              value={settings.wakeWord}
              onChange={(e) => onChange({ wakeWord: e.target.value })}
              placeholder="tala"
            />
          </Field>
        )}

        {settings.listenMode !== "tap" && (
          <Field label="Auto-close after silence">
            <div className="grid grid-cols-5 gap-1.5">
              {[30, 60, 120, 300, 0].map((s) => (
                <button
                  key={s}
                  onClick={() => onChange({ silenceTimeoutSec: s })}
                  className={`rounded-lg border px-1 py-2 text-[11px] ${
                    settings.silenceTimeoutSec === s
                      ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                      : "border-slate-700/60 text-slate-400"
                  }`}
                >
                  {s === 0 ? "Never" : s < 60 ? `${s}s` : `${s / 60}m`}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/80">Ending a call</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Say any of: <em>"stop conversation"</em>, <em>"stop listening"</em>,{" "}
            <em>"go to sleep"</em>, <em>"that will be all"</em> — or just tap the orb / the{" "}
            <strong className="text-emerald-300">End</strong> button.
          </p>
        </div>
      </section>

      <VoiceLab settings={settings} onChange={onChange} />

      <ModelPicker settings={settings} onChange={onChange} />

      <section className="glass rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Preferences</h2>
        <Field label="Time zone" hint="IANA name, e.g. Europe/London. Use 'local' for device time.">
          <input
            className={input}
            value={settings.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            placeholder="local"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(["metric", "imperial"] as const).map((u) => (
            <button
              key={u}
              onClick={() => onChange({ units: u })}
              className={`rounded-xl border px-3 py-2.5 text-sm capitalize ${
                settings.units === u
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 bg-slate-950/40 text-slate-300"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
      </button>
    </div>
  );
}

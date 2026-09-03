"use client";

import { useState } from "react";
import type { TaskItem } from "@/lib/clientTypes";

type Props = { tasks: TaskItem[]; reload: () => Promise<void> };

export default function TasksPanel({ tasks, reload }: Props) {
  const [title, setTitle] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    await reload();
  };

  const toggle = async (t: TaskItem) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, done: !t.done }),
    });
    await reload();
  };

  const remove = async (id: number) => {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    await reload();
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="space-y-5 pb-28">
      <div className="glass flex gap-2 rounded-2xl p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New task…"
          className="flex-1 rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
        />
        <button onClick={add} className="rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950">
          Add
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          Open · {open.length}
        </h2>
        {open.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-700/60 p-6 text-center text-sm text-slate-500">
            Board is clear.
          </p>
        )}
        {open.map((t) => (
          <div key={t.id} className="glass flex items-center gap-3 rounded-xl px-3 py-3">
            <button
              onClick={() => toggle(t)}
              className="h-5 w-5 shrink-0 rounded-full border border-cyan-400/60"
            />
            <span className="flex-1 text-sm text-slate-100">{t.title}</span>
            <button onClick={() => remove(t.id)} className="text-xs text-slate-500">
              ✕
            </button>
          </div>
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Completed · {done.length}
          </h2>
          {done.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-800/60 px-3 py-2.5">
              <button
                onClick={() => toggle(t)}
                className="h-5 w-5 shrink-0 rounded-full border border-emerald-400/60 bg-emerald-400/30"
              />
              <span className="flex-1 text-sm text-slate-500 line-through">{t.title}</span>
              <button onClick={() => remove(t.id)} className="text-xs text-slate-600">
                ✕
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import type { KnowledgeItem } from "@/lib/clientTypes";

type Props = {
  items: KnowledgeItem[];
  reload: () => Promise<void>;
};

const input =
  "w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60";

/* ------------------------------------------------------------------ */
/* File import                                                         */
/* ------------------------------------------------------------------ */

type ParsedItem = { title: string; content: string; checked: boolean };

function parseTitleBlocks(raw: string): ParsedItem[] {
  const blocks = raw.split(/(?=^\*\*Title:\*\*\s)/m).filter((b) => b.trim());
  if (blocks.length <= 1 && !/^\*\*Title:\*\*\s/i.test(raw)) {
    const trimmed = raw.trim().slice(0, 2000);
    return trimmed ? [{ title: "Imported file", content: trimmed, checked: true }] : [];
  }
  return blocks
    .map((block) => {
      const m = block.match(/^\*\*Title:\*\*\s*(.+)/m);
      const title = m ? m[1].trim().slice(0, 160) : "Untitled";
      const content = (m ? block.slice(m[0].length) : block).trim().slice(0, 2000);
      return content ? { title, content, checked: true } : null;
    })
    .filter((x): x is ParsedItem => x !== null);
}

function FileImport({ onImported }: { onImported: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (file.size > 500 * 1024) {
      alert("File too large — max 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const items = parseTitleBlocks(text);
      if (!items.length) {
        alert("No content found in that file.");
        return;
      }
      setParsed(items);
      setDone(null);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const toggle = (i: number) =>
    setParsed((p) =>
      p ? p.map((item, idx) => (idx === i ? { ...item, checked: !item.checked } : item)) : p,
    );

  const doImport = async () => {
    if (!parsed) return;
    const selected = parsed.filter((p) => p.checked);
    if (!selected.length) return;
    setImporting(true);
    let ok = 0;
    for (let i = 0; i < selected.length; i++) {
      setProgress(`importing ${i + 1} of ${selected.length}…`);
      try {
        const r = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: selected[i].title,
            content: selected[i].content,
            source: "file-import",
          }),
        });
        if (r.ok) ok++;
      } catch {
        /* skip failed item */
      }
    }
    setImporting(false);
    setProgress(null);
    setParsed(null);
    setDone(`Imported ${ok} item${ok === 1 ? "" : "s"}.`);
    setTimeout(() => setDone(null), 4000);
    await onImported();
  };

  return (
    <section className="glass rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Import file</h2>

      {!parsed ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            aria-label="Choose a knowledge file to import"
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 transition ${
              dragging ? "border-cyan-400/70 bg-cyan-400/10" : "border-slate-700/60 bg-slate-950/40"
            }`}
          >
            <span className="text-2xl">📄</span>
            <span className="text-[12px] text-slate-300">
              Drop a <code>.txt</code> or <code>.md</code> file here, or tap to choose
            </span>
            <span className="text-[10px] text-slate-500">Max 500 KB · splits on **Title:** blocks</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {done && (
            <p className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-2 text-[11px] text-emerald-200">
              {done}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {parsed.map((item, i) => (
              <label
                key={i}
                className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition ${
                  item.checked
                    ? "border-cyan-400/40 bg-cyan-400/5"
                    : "border-slate-700/50 bg-slate-950/30 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggle(i)}
                  className="mt-0.5 accent-cyan-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-slate-100">{item.title}</p>
                  <p className="line-clamp-2 text-[10px] text-slate-500">{item.content.slice(0, 120)}</p>
                </div>
              </label>
            ))}
          </div>

          {importing && <p className="text-center text-[11px] text-cyan-200">{progress}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setParsed(null)}
              disabled={importing}
              className="flex-1 rounded-xl border border-slate-700/60 py-2.5 text-[12px] text-slate-300 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={doImport}
              disabled={importing || !parsed.some((p) => p.checked)}
              className="flex-1 rounded-xl bg-cyan-500 py-2.5 text-[12px] font-semibold text-slate-950 disabled:opacity-40"
            >
              {importing
                ? progress
                : `Import ${parsed.filter((p) => p.checked).length} item${parsed.filter((p) => p.checked).length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main panel                                                          */
/* ------------------------------------------------------------------ */

export default function KnowledgePanel({ items, reload }: Props) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const add = async () => {
    setBusy(true);
    const payload = mode === "bulk" ? { bulk, tags } : { title, content, tags };
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setContent("");
      setBulk("");
      await reload();
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
    await reload();
  };

  const filtered = items.filter((k) =>
    query
      ? `${k.title} ${k.tags} ${k.content}`.toLowerCase().includes(query.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-5 pb-28">
      <section className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Teach your assistant</h2>
          <div className="flex rounded-lg border border-slate-700/70 p-0.5 text-[11px]">
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2 py-1 capitalize ${mode === m ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}
              >
                {m === "single" ? "Entry" : "Paste doc"}
              </button>
            ))}
          </div>
        </div>

        {mode === "single" ? (
          <>
            <input
              className={input}
              placeholder="Title — e.g. My morning routine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className={`${input} h-32 resize-none`}
              placeholder="Facts, preferences, procedures, people, passwords hints, project context…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </>
        ) : (
          <textarea
            className={`${input} h-44 resize-none`}
            placeholder={
              "Paste a whole document. It will be split into entries at markdown headings (# Heading) or blank-line breaks."
            }
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
        )}

        <input
          className={input}
          placeholder="Tags (comma separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <button
          onClick={add}
          disabled={busy || (mode === "single" ? !title || !content : !bulk.trim())}
          className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          {busy ? "Storing…" : mode === "single" ? "Add to knowledge base" : "Import document"}
        </button>
      </section>

      <FileImport onImported={reload} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">
            Knowledge base · {items.length}
          </h2>
        </div>
        <input
          className={input}
          placeholder="Search entries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-700/60 p-6 text-center text-sm text-slate-500">
            Nothing stored yet. Anything you add here is what your assistant treats as truth.
          </p>
        )}
        {filtered.map((k) => (
          <article key={k.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <button className="text-left" onClick={() => setOpen(open === k.id ? null : k.id)}>
                <h3 className="text-sm font-medium text-slate-100">{k.title}</h3>
                <p className={`mt-1 text-xs text-slate-400 ${open === k.id ? "" : "line-clamp-2"} whitespace-pre-wrap`}>
                  {k.content}
                </p>
              </button>
              <button onClick={() => remove(k.id)} className="shrink-0 text-xs text-rose-400/80">
                delete
              </button>
            </div>
            {k.tags ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {k.tags
                  .split(",")
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">
                      {t.trim()}
                    </span>
                  ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

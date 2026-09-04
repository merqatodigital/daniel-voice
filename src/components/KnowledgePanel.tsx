"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { KnowledgeItem } from "@/lib/clientTypes";

type Props = {
  items: KnowledgeItem[];
  reload: () => Promise<void>;
};

const input =
  "w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60";

const MAX_FILE_BYTES = 500 * 1024;
type ImportItem = { id: number; title: string; content: string; checked: boolean };

function parseKnowledgeFile(text: string, filename: string): ImportItem[] {
  const marker = /^\s*\*\*Title:\*\*\s*(.+?)\s*$/gim;
  const matches = [...text.matchAll(marker)];
  if (!matches.length) {
    const content = text.trim().slice(0, 2000);
    const title = filename.replace(/\.(txt|md)$/i, "").trim() || "Imported knowledge";
    return content ? [{ id: 0, title, content, checked: true }] : [];
  }
  return matches
    .map((match, id) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[id + 1]?.index ?? text.length;
      return {
        id,
        title: match[1].trim().slice(0, 160),
        content: text.slice(start, end).trim().slice(0, 2000),
        checked: true,
      };
    })
    .filter((item) => item.title && item.content);
}

export default function KnowledgePanel({ items, reload }: Props) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState<{ current: number; total: number } | null>(null);
  const [imported, setImported] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = async (file?: File) => {
    setImportError("");
    setImported("");
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      setImportError("Choose a .txt or .md file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setImportError("That file is over 500 KB.");
      return;
    }
    try {
      const parsed = parseKnowledgeFile(await file.text(), file.name);
      if (!parsed.length) throw new Error("No knowledge items found.");
      setImportName(file.name);
      setImportItems(parsed);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read that file.");
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    void loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  };

  const cancelImport = () => {
    setImportItems([]);
    setImportName("");
    setImportError("");
  };

  const importSelected = async () => {
    const selected = importItems.filter((item) => item.checked);
    if (!selected.length) return;
    let success = 0;
    for (let i = 0; i < selected.length; i++) {
      setImporting({ current: i + 1, total: selected.length });
      try {
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: selected[i].title,
            content: selected[i].content,
            tags: "file-import",
          }),
        });
        if (res.ok) success++;
      } catch {
        // Skip failed items individually and continue the batch.
      }
    }
    setImporting(null);
    setImportItems([]);
    setImportName("");
    await reload();
    setImported(`Imported ${success} item${success === 1 ? "" : "s"}.`);
    window.setTimeout(() => setImported(""), 3500);
  };

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

  const selectedCount = importItems.filter((item) => item.checked).length;

  return (
    <div className="space-y-5 pb-28">
      <section className="glass rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Import knowledge file</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Load multiple <strong>**Title:**</strong> blocks from a .txt or .md file.</p>
        </div>

        {!importItems.length && !importing && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a knowledge text file or choose a file"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
            className={`rounded-xl border border-dashed p-5 text-center transition ${dragging ? "border-cyan-300 bg-cyan-400/10" : "border-cyan-400/30 bg-slate-950/35"}`}
          >
            <div className="text-xl">⇩</div>
            <p className="mt-1 text-xs text-slate-300">Drop a .txt or .md file here</p>
            <button type="button" className="mt-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100">Choose file</button>
            <p className="mt-1.5 text-[10px] text-slate-600">Maximum 500 KB</p>
            <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={chooseFile} className="hidden" />
          </div>
        )}

        {importError && (
          <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">{importError}</p>
        )}
        {imported && (
          <p role="status" className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">✓ {imported}</p>
        )}

        {importItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] text-slate-400">{importName} · {importItems.length} found</p>
              <button onClick={() => setImportItems((list) => list.map((item) => ({ ...item, checked: true })))} className="shrink-0 text-[10px] text-cyan-300">select all</button>
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {importItems.map((item) => (
                <label key={item.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 ${item.checked ? "border-cyan-400/35 bg-cyan-400/5" : "border-slate-800 bg-slate-950/25 opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => setImportItems((list) => list.map((row) => row.id === item.id ? { ...row, checked: !row.checked } : row))}
                    className="mt-0.5 accent-cyan-400"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-slate-100">{item.title}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{item.content.slice(0, 120)}{item.content.length > 120 ? "…" : ""}</span>
                  </span>
                </label>
              ))}
            </div>
            {importing && <p role="status" className="text-center text-[11px] text-cyan-200">Importing {importing.current} of {importing.total}…</p>}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button onClick={importSelected} disabled={!selectedCount || Boolean(importing)} className="rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{importing ? `Importing ${importing.current} of ${importing.total}…` : `Import ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}</button>
              <button onClick={cancelImport} disabled={Boolean(importing)} className="rounded-xl border border-slate-700 px-3 text-xs text-slate-300 disabled:opacity-40">Cancel</button>
            </div>
          </div>
        )}
      </section>

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
            placeholder={"Paste a whole document. It will be split into entries at markdown headings (# Heading) or blank-line breaks."}
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
                {k.tags.split(",").filter(Boolean).map((t) => (
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

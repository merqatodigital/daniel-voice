"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_INFO, findVoice, loadCatalog } from "@/lib/tts/catalog";
import { primeAudio, setKokoroDtype } from "@/lib/tts/engine";
import { getPersona } from "@/lib/personas";
import { isStopPhrase, matchWakeWord } from "@/lib/conversation";
import { fetchHealth, type HealthReport } from "@/lib/health";
import Orb from "@/components/Orb";
import SettingsPanel from "@/components/SettingsPanel";
import KnowledgePanel from "@/components/KnowledgePanel";
import TasksPanel from "@/components/TasksPanel";
import { useListener, useTts, type TtsConfig } from "@/lib/useSpeech";
import {
  DEFAULT_SETTINGS,
  type ChatMsg,
  type ClientSettings,
  type KnowledgeItem,
  type TaskItem,
} from "@/lib/clientTypes";

type Tab = "talk" | "tasks" | "brain" | "setup";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "talk", label: "Talk", icon: "◉" },
  { key: "tasks", label: "Tasks", icon: "☑" },
  { key: "brain", label: "Brain", icon: "❖" },
  { key: "setup", label: "Setup", icon: "⚙" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("talk");
  const [settings, setSettings] = useState<ClientSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const { say, stop, speaking, status, setConfig } = useTts();

  // The listener is created first so `send` can mute/resume the mic. The actual
  // handler is swapped in each render through this ref.
  const handlerRef = useRef<(text: string) => void>(() => {});
  const {
    active: convoOpen,
    listening,
    interim,
    supported,
    error: micError,
    begin,
    pause,
    resume,
    end,
  } = useListener((text) => handlerRef.current(text));

  const loadTasks = useCallback(async () => {
    const r = await fetch("/api/tasks");
    const j = await r.json();
    setTasks(j.tasks ?? []);
  }, []);

  const loadKnowledge = useCallback(async () => {
    const r = await fetch("/api/knowledge");
    const j = await r.json();
    setKnowledge(j.knowledge ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const [s, m, , h] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/chat").then((r) => r.json()),
        loadCatalog(), // voice names in the header resolve from the live catalogue
        fetchHealth(), // best-effort rollup; runs in parallel with the rest
      ]);
      if (s.settings) setSettings({ ...DEFAULT_SETTINGS, ...s.settings });
      setHealth(h);
      setMessages(
        (m.messages ?? []).map((x: { id: number; role: string; content: string }) => ({
          id: String(x.id),
          role: x.role === "agent" ? "agent" : "user",
          content: x.content,
        })),
      );
      await Promise.all([loadTasks(), loadKnowledge()]);
    })();
  }, [loadTasks, loadKnowledge]);

  useEffect(() => {
    setKokoroDtype(settings.kokoroDtype);
    setConfig({
      engine: settings.voiceEngine,
      voiceId: settings.voiceId,
      voiceURI: settings.voiceURI,
      gender: settings.voiceGender,
      rate: settings.voiceRate,
      pitch: settings.voicePitch,
    });
  }, [settings, setConfig]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  /** Build the TTS config from the current settings snapshot. */
  const ttsConfig = useCallback((): TtsConfig => {
    const s = settingsRef.current;
    return {
      engine: s.voiceEngine,
      voiceId: s.voiceId,
      voiceURI: s.voiceURI,
      gender: s.voiceGender,
      rate: s.voiceRate,
      pitch: s.voicePitch,
    };
  }, []);

  const lastHeardRef = useRef(Date.now());
  const busyRef = useRef(false); // mid-request or mid-utterance
  const touchActivity = useCallback(() => {
    lastHeardRef.current = Date.now();
  }, []);

  /** Speak a line with the mic muted, then re-open it once we're done. */
  const speakThenResume = useCallback(
    async (text: string) => {
      pause();
      busyRef.current = true;
      try {
        await say(text, ttsConfig());
      } finally {
        busyRef.current = false;
        touchActivity();
        window.setTimeout(() => resume(), 700);
      }
    },
    [pause, resume, say, ttsConfig, touchActivity],
  );

  const send = useCallback(
    async (text: string) => {
      const input = text.trim();
      if (!input) return;
      setDraft("");
      // Mute the mic while we process and speak so the agent never hears itself.
      pause();
      busyRef.current = true;
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: input }]);
      setThinking(true);
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });

        let reply = "";
        const isStream = (r.headers.get("Content-Type") ?? "").startsWith("text/plain");

        if (isStream && r.body) {
          // ---- Streaming LLM reply: append tokens as they arrive. ----
          const engine = r.headers.get("X-Engine") ?? "llm";
          let used: { id: number; title: string }[] = [];
          try {
            used = JSON.parse(decodeURIComponent(r.headers.get("X-Used-Knowledge") ?? "[]"));
          } catch {
            used = [];
          }
          const id = `a${Date.now()}`;
          setThinking(false); // streaming text replaces the ● ● ● indicator
          setMessages((m) => [...m, { id, role: "agent", content: "", engine, used }]);

          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let lastRender = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (!chunk) continue;
            reply += chunk;
            const now = Date.now();
            if (now - lastRender > 30 || done) {
              const snapshot = reply;
              setMessages((m) =>
                m.map((msg) => (msg.id === id ? { ...msg, content: snapshot } : msg)),
              );
              lastRender = now;
            }
          }
          reply = reply.trim();
          if (!reply) {
            reply = "The model returned nothing. Try again.";
            setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, content: reply } : msg)));
          }
        } else {
          // ---- JSON response (API errors, local brain, etc.). ----
          let j: Record<string, unknown> = {};
          try {
            const text = await r.text();
            if (text) j = JSON.parse(text);
          } catch {
            // Response was not valid JSON (e.g. 500 error page)
          }
          if (!r.ok) {
            reply = (j.error as string) ?? `Request failed (HTTP ${r.status}). Try again.`;
          } else {
            reply = (j.reply as string) ?? "Connection issue. Try again.";
          }
          setMessages((m) => [
            ...m,
            { id: `a${Date.now()}`, role: "agent", content: reply, engine: j.engine as string, used: j.usedKnowledge as { id: number; title: string }[] },
          ]);
          if (j.tasks) setTasks(j.tasks as TaskItem[]);
        }

        // Speak only once the full reply is assembled.
        if (settingsRef.current.speakReplies) {
          await say(reply, ttsConfig());
        }
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong sending that. Try again.";
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: "agent", content: msg }]);
      } finally {
        setThinking(false);
        busyRef.current = false;
        touchActivity();
        // Give the speaker a beat to stop echoing before we re-open the mic.
        window.setTimeout(() => {
          if (settingsRef.current.listenMode === "tap") end();
          else resume();
        }, 700);
      }
    },
    [say, pause, resume, end, ttsConfig, touchActivity],
  );

  const endConversation = useCallback(
    async (announce = true) => {
      end();
      if (announce && settingsRef.current.speakReplies) {
        await say(`Conversation ended. I'm standing by, ${settingsRef.current.userName}.`, ttsConfig());
      }
    },
    [end, say, ttsConfig],
  );

  const beginConversation = useCallback(() => {
    touchActivity();
    begin();
    const s = settingsRef.current;
    if (!s.speakReplies) return;
    const persona = getPersona(s.attitude, s.customAttitude);
    const greeting = (persona.greetings[0] ?? "I'm listening.").replaceAll("{user}", s.userName);
    void speakThenResume(
      s.listenMode === "wake"
        ? `${greeting} Say ${s.wakeWord || s.agentName} when you need me.`
        : greeting,
    );
  }, [begin, speakThenResume, touchActivity]);

  const handleTranscript = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      touchActivity();
      const s = settingsRef.current;

      // 1) Stop the conversation by voice.
      if (isStopPhrase(text)) {
        void endConversation(true);
        return;
      }

      // 2) Wake-word mode: ignore everything until we hear the magic word.
      if (s.listenMode === "wake") {
        const { heard, cleaned } = matchWakeWord(text, [s.wakeWord, s.agentName]);
        if (!heard) return;
        const question = cleaned.trim();
        if (!question) {
          void speakThenResume(`Yes, ${s.userName}?`);
          return;
        }
        void send(question);
        return;
      }

      void send(text);
    },
    [endConversation, speakThenResume, send, touchActivity],
  );

  useEffect(() => {
    handlerRef.current = handleTranscript;
  }, [handleTranscript]);

  // Close the mic automatically after a stretch of silence (saves battery).
  useEffect(() => {
    if (!convoOpen) return;
    const secs = settings.silenceTimeoutSec;
    if (!secs) return; // 0 = never
    const id = window.setInterval(() => {
      // Never time out in the middle of processing or speaking.
      if (busyRef.current) {
        lastHeardRef.current = Date.now();
        return;
      }
      if (Date.now() - lastHeardRef.current > secs * 1000) {
        void endConversation(true);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [convoOpen, settings.silenceTimeoutSec, endConversation]);

  const saveSettings = useCallback(async () => {
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsRef.current),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j.error ?? `HTTP ${r.status}`) as string);
    }
    const j = await r.json();
    if (j.settings) setSettings({ ...DEFAULT_SETTINGS, ...j.settings });
  }, []);

  const modelLabel = useMemo(() => {
    if (!settings.openrouterModel) return "No model selected";
    const m = settings.openrouterModel;
    const short = m.split('/').pop() ?? m;
    return short.replace(':free', ' (free)');
  }, [settings.openrouterModel]);

  const voiceSummary = useMemo(() => {
    const name =
      settings.voiceEngine === "system"
        ? settings.voiceURI
          ? settings.voiceURI.split("#")[0].slice(0, 18)
          : "auto"
        : (findVoice(settings.voiceEngine, settings.voiceId)?.name ?? settings.voiceId);
    return `${ENGINE_INFO[settings.voiceEngine].label} · ${name}`;
  }, [settings.voiceEngine, settings.voiceId, settings.voiceURI]);

  const orbState: "idle" | "live" | "listening" | "thinking" | "speaking" = listening
    ? "listening"
    : thinking || status.stage === "loading"
      ? "thinking"
      : speaking
        ? "speaking"
        : convoOpen
          ? "live"
          : "idle";

  const orbLabel =
    status.stage === "loading"
      ? (status.label ?? "loading").slice(0, 22)
      : listening
        ? "listening"
        : thinking
          ? "processing"
          : speaking
            ? convoOpen
              ? "speaking"
              : "tap to stop"
            : convoOpen
              ? "live · tap to end"
              : supported
                ? "tap to talk"
                : "type below";

  // iOS will not play audio unless a real user gesture has unlocked playback.
  useEffect(() => {
    const unlock = () => primeAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const onOrbTap = () => {
    // Tap once to open a hands-free conversation; tap again to close it.
    if (convoOpen) {
      void endConversation(true);
      return;
    }
    if (speaking) return stop();
    if (!supported) {
      setTab("talk");
      return;
    }
    beginConversation();
  };

  const clearChat = async () => {
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
  };

  return (
    <main className="mx-auto flex min-h-dvh flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:max-w-md">
      <header className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[0.25em] text-cyan-200 hud-text">
            {settings.agentName.toUpperCase()}
          </h1>
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {modelLabel} · {settings.attitude} · {voiceSummary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shadow-[0_0_10px] ${!health ? "bg-amber-400 shadow-amber-400/70" : health.ok ? "bg-emerald-400 shadow-emerald-400/70" : "bg-rose-400 shadow-rose-400/70"}`} />
          <span className="text-[10px] uppercase tracking-widest text-slate-500">
            {!health ? "boot" : health.ok ? "online" : "offline"}
          </span>
        </div>
      </header>

      {micError && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
          {micError}
        </div>
      )}

      {convoOpen && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-emerald-100">
              {interim
                ? interim
                : listening
                  ? "Listening…"
                  : thinking
                    ? "Thinking…"
                    : speaking
                      ? "Speaking…"
                      : "Conversation live"}
            </p>
            <p className="truncate text-[10px] text-emerald-200/60">
              {settings.listenMode === "wake"
                ? `Say “${settings.wakeWord || settings.agentName}” to activate`
                : "Say “stop conversation” or tap the orb to end"}
            </p>
          </div>
          <button
            onClick={() => void endConversation(true)}
            className="shrink-0 rounded-lg bg-emerald-500/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-100"
          >
            End
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
      {tab === "talk" && (
        <div className="flex h-full flex-col">
          <div className="py-2">
            <Orb state={orbState} onTap={onOrbTap} label={orbLabel} />
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto pb-40"
            style={{ maxHeight: "calc(100dvh - 18rem)" }}
          >
              {messages.length === 0 && (
                <div className="glass rounded-2xl p-4 text-sm text-slate-300">
                  <p className="text-cyan-200">Systems online, {settings.userName}.</p>
                  <p className="mt-2 text-slate-400">
                    Tap the orb to start a hands-free conversation — just keep talking, I&apos;ll
                    listen after every reply. Say <em>“stop conversation”</em> or tap the orb again
                    to end it.
                  </p>
                  <p className="mt-2 text-slate-500">
                    Try: <em>“task: book dentist”</em>, <em>“my briefing”</em>,{" "}
                    <em>“remember that my wifi is on channel 6”</em>.
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-md bg-cyan-500/90 text-slate-950"
                        : "glass rounded-bl-md text-slate-100"
                    }`}
                  >
                    {m.content}
                    {m.role === "agent" && m.used && m.used.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-cyan-400/15 pt-2">
                        {m.used.map((u) => (
                          <span key={u.id} className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">
                            ❖ {u.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {interim && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md border border-cyan-400/30 px-3.5 py-2.5 text-sm italic text-cyan-200/70">
                    {interim}
                  </div>
                </div>
              )}
              {thinking && (
                <div className="glass w-fit rounded-2xl rounded-bl-md px-4 py-3 text-sm text-cyan-300">
                  ● ● ●
                </div>
              )}
            </div>

            <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] mx-auto max-w-md px-4 sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]">
              <div className="glass flex items-center gap-2 rounded-2xl p-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(draft)}
                  placeholder={`Message ${settings.agentName}…`}
                  className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-600"
                />
                {messages.length > 0 && (
                  <button onClick={clearChat} className="px-1 text-xs text-slate-500">
                    clear
                  </button>
                )}
                <button
                  onClick={() => send(draft)}
                  disabled={!draft.trim()}
                  className="rounded-xl bg-cyan-500 px-3.5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-30"
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        )}

        {tab !== "talk" && (
          <div className="h-full overflow-y-auto" style={{ maxHeight: "calc(100dvh - 8rem)" }}>
            {tab === "tasks" && <TasksPanel tasks={tasks} reload={loadTasks} />}
            {tab === "brain" && <KnowledgePanel items={knowledge} reload={loadKnowledge} />}
            {tab === "setup" && (
              <SettingsPanel
                settings={settings}
                onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                onSave={saveSettings}
              />
            )}
          </div>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-cyan-400/15 bg-[#04070d]/90 px-4 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="flex justify-between py-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] uppercase tracking-widest transition ${
                tab === t.key ? "text-cyan-300" : "text-slate-500"
              }`}
            >
              <span className="text-base leading-none text-lg">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

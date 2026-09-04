"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak, stopAudio, type TtsStatus } from "@/lib/tts/engine";
import { guessGender } from "@/lib/tts/engine";
import type { VoiceEngine } from "@/lib/tts/catalog";

export type SimpleVoice = {
  name: string;
  lang: string;
  uri: string;
  guessed: "male" | "female" | "unknown";
};

export function useVoices() {
  const [voices, setVoices] = useState<SimpleVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    let mounted = true;
    const load = () => {
      if (!mounted) return;
      const list = window.speechSynthesis.getVoices().map((v) => ({
        name: v.name,
        lang: v.lang,
        uri: v.voiceURI,
        guessed: guessGender(v.name),
      }));
      if (list.length) setVoices(list);
    };
    load();
    // Chrome populates the list asynchronously and may fire several times.
    const t = setTimeout(load, 400);
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      mounted = false;
      clearTimeout(t);
      window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);

  return voices;
}

export type TtsConfig = {
  engine: VoiceEngine;
  voiceId: string;
  voiceURI: string;
  gender: "male" | "female";
  rate: number;
  pitch: number;
};

export function useTts() {
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState<TtsStatus>({ stage: "idle" });
  const cfgRef = useRef<TtsConfig | null>(null);

  const setConfig = useCallback((c: TtsConfig) => {
    cfgRef.current = c;
  }, []);

  const say = useCallback(async (text: string, cfgOverride?: TtsConfig) => {
    const cfg = cfgOverride ?? cfgRef.current;
    if (!cfg || !text.trim()) return;
    setSpeaking(true);
    try {
      await speak({
        engine: cfg.engine,
        voiceId: cfg.voiceId,
        voiceURI: cfg.voiceURI,
        gender: cfg.gender,
        rate: cfg.rate,
        pitch: cfg.pitch,
        text,
        onStatus: (s) => {
          setStatus(s);
          if (s.stage === "idle") setSpeaking(false);
        },
      });
    } finally {
      setSpeaking(false);
      setStatus({ stage: "idle" });
    }
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    setSpeaking(false);
    setStatus({ stage: "idle" });
  }, []);

  return { say, stop, speaking, status, setConfig };
}

type SRType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

export type ListenerApi = {
  /** True while a hands-free conversation is open (mic may be paused). */
  active: boolean;
  listening: boolean;
  interim: string;
  supported: boolean;
  error: string | null;
  /** Start (or keep) the conversation open — auto-restarts after each utterance. */
  begin: () => void;
  /** Temporarily stop the mic (agent is thinking / speaking) but stay in conversation. */
  pause: () => void;
  /** Re-open the mic after a pause, if the conversation is still active. */
  resume: () => void;
  /** End the conversation for good. */
  end: () => void;
};

/**
 * Wraps the Web Speech API for hands-free conversation. `begin()` keeps the
 * microphone open across utterances: the browser ends the session on silence,
 * so we transparently restart it until `end()` is called.
 */
export function useListener(onFinal: (text: string) => void): ListenerApi {
  const [listening, setListening] = useState(false);
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SRType | null>(null);
  const cbRef = useRef(onFinal);
  useEffect(() => {
    cbRef.current = onFinal;
  }, [onFinal]);

  const activeRef = useRef(false); // conversation open
  const pausedRef = useRef(false); // mic muted while agent works
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startNow = useCallback(() => {
    if (restartRef.current) {
      clearTimeout(restartRef.current);
      restartRef.current = null;
    }
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.start();
      setListening(true);
    } catch {
      // Already running — that's fine.
    }
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return;
    if (restartRef.current) clearTimeout(restartRef.current);
    // Short backoff so we don't hammer the service (and let audio settle).
    restartRef.current = setTimeout(() => {
      restartRef.current = null;
      if (activeRef.current && !pausedRef.current) startNow();
    }, 350);
  }, [startNow]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SRType;
      webkitSpeechRecognition?: new () => SRType;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const supportTimer = window.setTimeout(() => setSupported(true), 0);
    const rec = new Ctor();
    rec.continuous = true; // keep the session open across sentences
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let partial = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) final += t;
        else partial += t;
      }
      setInterim(partial);
      if (final.trim()) {
        setInterim("");
        cbRef.current(final.trim());
      }
    };
    rec.onend = () => {
      setListening(false);
      scheduleRestart();
    };
    rec.onerror = (e: { error?: string }) => {
      const code = e?.error;
      setListening(false);
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Microphone blocked — enable it in your browser settings.");
        activeRef.current = false;
        pausedRef.current = false;
        setActive(false);
        return;
      }
      // no-speech / aborted / network are routine in continuous mode.
      if (code === "audio-capture") {
        setError("No microphone found.");
        activeRef.current = false;
        setActive(false);
        return;
      }
      scheduleRestart();
    };
    recRef.current = rec;
    return () => {
      window.clearTimeout(supportTimer);
      activeRef.current = false;
      if (restartRef.current) clearTimeout(restartRef.current);
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, [scheduleRestart]);

  const begin = useCallback(() => {
    setError(null);
    activeRef.current = true;
    setActive(true);
    pausedRef.current = false;
    startNow();
  }, [startNow]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (restartRef.current) {
      clearTimeout(restartRef.current);
      restartRef.current = null;
    }
    setListening(false);
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const resume = useCallback(() => {
    if (!activeRef.current) return;
    pausedRef.current = false;
    startNow();
  }, [startNow]);

  const end = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    pausedRef.current = false;
    if (restartRef.current) {
      clearTimeout(restartRef.current);
      restartRef.current = null;
    }
    setListening(false);
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  return { active, listening, interim, supported, error, begin, pause, resume, end };
}

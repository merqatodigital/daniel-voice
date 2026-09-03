export type ClientSettings = {
  id: number;
  userName: string;
  agentName: string;
  attitude: string;
  customAttitude: string;
  voiceGender: "male" | "female";
  voiceEngine: "system" | "piper" | "kokoro";
  voiceId: string;
  kokoroDtype: "q8" | "fp32";
  voiceRate: number;
  voicePitch: number;
  voiceURI: string;
  speakReplies: boolean;
  wakeWord: string;
  listenMode: "continuous" | "wake" | "tap";
  silenceTimeoutSec: number;
  openrouterModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  llmMode: "auto" | "always" | "off";
  timezone: string;
  units: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  promptPrice: string;
  completionPrice: string;
  isFree: boolean;
  provider: string;
  modalities: string;
  createdAt: number;
};

export type KeyStatus = {
  configured: boolean;
  masked: string;
  status: { ok: boolean; label?: string; limit?: number | null; usage?: number; error?: string } | null;
};

export type ChatMsg = {
  id: string;
  role: "user" | "agent";
  content: string;
  engine?: string;
  used?: { id: number; title: string }[];
};

export type TaskItem = { id: number; title: string; done: boolean };

export type KnowledgeItem = {
  id: number;
  title: string;
  content: string;
  tags: string;
  source: string;
};

export const DEFAULT_SETTINGS: ClientSettings = {
  id: 1,
  userName: "Sir",
  agentName: "JARVIS",
  attitude: "butler",
  customAttitude: "",
  voiceGender: "male",
  voiceEngine: "system",
  voiceId: "",
  kokoroDtype: "q8",
  voiceRate: 100,
  voicePitch: 100,
  voiceURI: "",
  speakReplies: true,
  wakeWord: "jarvis",
  listenMode: "continuous",
  silenceTimeoutSec: 45,
  openrouterModel: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
  llmMode: "auto",
  timezone: "local",
  units: "metric",
};

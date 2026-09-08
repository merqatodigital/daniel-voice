/** Core types shared between the Next.js frontend and its API routes. */

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
  timezone: string;
  units: "metric" | "imperial";
};

export type ChatMsg = {
  id: string;
  role: "user" | "agent";
  content: string;
  engine?: string;
  used?: { id: number; title: string }[];
};

export type KnowledgeItem = {
  id: number;
  title: string;
  content: string;
  tags: string;
};

export type TaskItem = {
  id: number;
  title: string;
  done: boolean;
  dueAt?: string;
};

export const DEFAULT_SETTINGS: ClientSettings = {
  id: 1,
  userName: "Sir",
  agentName: "TALA",
  attitude: "butler",
  customAttitude: "",
  voiceGender: "female",
  voiceEngine: "kokoro",
  voiceId: "af_heart",
  kokoroDtype: "q8",
  voiceRate: 100,
  voicePitch: 100,
  voiceURI: "",
  speakReplies: true,
  wakeWord: "tala",
  listenMode: "continuous",
  silenceTimeoutSec: 45,
  timezone: "local",
  units: "metric",
};

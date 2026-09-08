export async function getSettings() {
  return {
    id: 1,
    userName: "Sir",
    agentName: "TALA",
    attitude: "butler",
    customAttitude: "",
    voiceGender: "female",
    voiceEngine: "system",
    voiceId: "",
    kokoroDtype: "q8",
    voiceRate: 100,
    voicePitch: 100,
    voiceURI: "",
    speakReplies: true,
    wakeWord: "tala",
    listenMode: "tap",
    silenceTimeoutSec: 45,
    openrouterKey: "",
    openrouterModel: "",
    llmBackend: "auto",
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "",
    llmMode: "auto",
    timezone: "local",
    units: "metric",
    updatedAt: new Date().toISOString(),
  };
}

export async function getKnowledge() {
  return [];
}

export async function getTasks() {
  return [];
}

export async function getMessages(limit = 60) {
  return [];
}

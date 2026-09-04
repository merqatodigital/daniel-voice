/** Helpers for hands-free, continuous conversation. */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’`]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Attention-getting filler that shouldn't be treated as the actual request. */
const FILLER = new Set([
  "hey","hi","hello","ok","okay","yo","so","now","and","well","um","uh","please","then","just",
]);

function stripFiller(text: string): string {
  const tokens = text.split(" ").filter(Boolean);
  while (tokens.length && FILLER.has(tokens[0])) tokens.shift();
  while (tokens.length && FILLER.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ").trim();
}

/** Exact-ish phrases that end the conversation. */
const STOP_EXACT = [
  "stop conversation",
  "stop the conversation",
  "stop listening",
  "stop talking",
  "stop this conversation",
  "end conversation",
  "end the conversation",
  "end session",
  "end the session",
  "stop session",
  "hang up",
  "go to sleep",
  "goodbye",
  "good bye",
  "thats all",
  "that is all",
  "that will be all",
  "thatll be all",
  "be quiet",
  "shut up",
  "nevermind",
  "never mind",
  "cancel",
  "pause conversation",
  "pause listening",
  "thats enough",
  "that is enough",
  "thatll do",
  "thatll do it",
  "that will do",
  "im done",
  "im finished",
  "all done",
  "sign off",
  "signing off",
  "talk later",
  "speak later",
  "thats it",
  "that is it",
];

/** Phrases that must simply start with these to count as a stop. */
const STOP_PREFIX = [
  "stop conversation",
  "end conversation",
  "stop listening",
  "end the conversation",
  "go to sleep",
  "that will be all",
  "that is all",
];

export function isStopPhrase(text: string): boolean {
  const t = normalise(text);
  if (!t) return false;
  if (t === "stop" || t === "stopp" || t === "stopped") return true;
  if (STOP_EXACT.includes(t)) return true;
  if (STOP_PREFIX.some((p) => t.startsWith(p))) return true;
  // "stop" / "that's all" as the opening words of a longer utterance.
  if (/^(stop|end|quit|exit)\b/.test(t) && t.split(" ").length <= 4) return true;
  return false;
}

/** Levenshtein distance — used to forgive mis-heard wake words. */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export type WakeResult = { heard: boolean; cleaned: string };

/**
 * Detects the wake word anywhere in the utterance and strips it out.
 * Tolerant of transcription slips ("jarvus", "hey tala", "ok tala").
 */
export function matchWakeWord(text: string, words: string[]): WakeResult {
  const cleanWords = words
    .map((w) => normalise(w))
    .filter((w) => w.length >= 2);
  if (!cleanWords.length) return { heard: true, cleaned: text };

  const t = normalise(text);
  const tokens = t.split(" ");
  let hitIndex = -1;
  let hitLen = 0;

  for (const w of cleanWords) {
    const wTokens = w.split(" ");
    for (let i = 0; i + wTokens.length <= tokens.length; i++) {
      const window = tokens.slice(i, i + wTokens.length).join(" ");
      if (window === w) {
        hitIndex = i;
        hitLen = wTokens.length;
        break;
      }
      // Forgive small transcription errors on the last token of the phrase.
      if (wTokens.length === 1) {
        const d = lev(window, w);
        const allowed = w.length >= 6 ? 2 : 1;
        if (d <= allowed) {
          hitIndex = i;
          hitLen = 1;
          break;
        }
      }
    }
    if (hitIndex >= 0) break;
  }

  if (hitIndex < 0) return { heard: false, cleaned: text };

  const remaining = [...tokens.slice(0, hitIndex), ...tokens.slice(hitIndex + hitLen)]
    .join(" ")
    .trim();
  // Empty means the user only said the wake word — the caller should prompt them.
  return { heard: true, cleaned: stripFiller(remaining) };
}

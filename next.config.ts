import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The open-source TTS engines (@huggingface/transformers for Kokoro and
  // onnxruntime-web for Piper) ship Node-only entrypoints that must not be
  // bundled for the browser. Both are dynamically imported client-side only.
  serverExternalPackages: ["kokoro-js", "@mintplex-labs/piper-tts-web"],
  turbopack: {
    resolveAlias: {
      "onnxruntime-node": "./src/lib/tts/empty.js",
      sharp: "./src/lib/tts/empty.js",
      fs: "./src/lib/tts/empty.js",
      path: "./src/lib/tts/empty.js",
      os: "./src/lib/tts/empty.js",
      crypto: "./src/lib/tts/empty.js",
      worker_threads: "./src/lib/tts/empty.js",
      child_process: "./src/lib/tts/empty.js",
    },
  },
};

export default nextConfig;

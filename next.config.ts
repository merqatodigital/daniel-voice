import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "kokoro-js", "@mintplex-labs/piper-tts-web"],
  turbopack: {
    resolveAlias: {
      "onnxruntime-node": "./src/lib/tts/empty.js",
      sharp: "./src/lib/tts/empty.js",
    },
  },
};

export default nextConfig;

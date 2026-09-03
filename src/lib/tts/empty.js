// Stub module used to neutralise Node-only packages (onnxruntime-node, sharp)
// that some open-source TTS dependencies reference in their optional imports.
// These must never execute in the browser.
export default {};

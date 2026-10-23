import { generate, type GenerateInput, type GenerateMessage } from "./generate";

const post = (message: GenerateMessage) => self.postMessage(message);

self.onmessage = (e: MessageEvent<GenerateInput>) =>
  post(generate(e.data, { onProgress: (progress) => post({ type: "progress", ...progress }) }));

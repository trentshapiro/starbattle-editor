import { reshape, type ReshapeInput, type ReshapeMessage } from "./reshape";

const post = (message: ReshapeMessage) => self.postMessage(message);

self.onmessage = (e: MessageEvent<ReshapeInput>) =>
  post(reshape(e.data, { onProgress: (progress) => post({ type: "progress", ...progress }) }));

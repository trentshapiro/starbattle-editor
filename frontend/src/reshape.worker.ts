import { withRating } from "./rate";
import { reshape, type ReshapeInput, type ReshapeMessage } from "./reshape";

const post = (message: ReshapeMessage) => self.postMessage(message);

self.onmessage = (e: MessageEvent<ReshapeInput>) => {
  const out = reshape(e.data, { onProgress: (progress) => post({ type: "progress", ...progress }) });
  post(out.type === "done" ? { ...out, result: withRating({ ...e.data, regions: out.regions }, out.result) } : out);
};

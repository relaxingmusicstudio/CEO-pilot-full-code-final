import { safeHandler } from "../src/kernel/apiJson.js";
import queue from "../api_handlers/queue.js";

export const config = { runtime: "nodejs" };

export default safeHandler(queue);

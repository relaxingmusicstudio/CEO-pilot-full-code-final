import { safeHandler } from "../src/kernel/apiJson.js";
import kernelState from "../api_handlers/kernel-state.js";

export const config = { runtime: "nodejs" };

export default safeHandler(kernelState);

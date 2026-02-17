import { safeHandler } from "../src/kernel/apiJson.js";
import kernelTask from "../api_handlers/kernel-task.js";

export const config = { runtime: "nodejs" };

export default safeHandler(kernelTask);

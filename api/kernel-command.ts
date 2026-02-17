import { safeHandler } from "../src/kernel/apiJson.js";
import kernelCommand from "../api_handlers/kernel-command.js";

export const config = { runtime: "nodejs" };

export default safeHandler(kernelCommand);

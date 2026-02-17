import { safeHandler } from "../src/kernel/apiJson.js";
import execute from "../api_handlers/execute.js";

export const config = { runtime: "nodejs" };

export default safeHandler(execute);

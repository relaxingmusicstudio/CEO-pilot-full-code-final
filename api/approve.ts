import { safeHandler } from "../src/kernel/apiJson.js";
import approve from "../api_handlers/approve.js";

export const config = { runtime: "nodejs" };

export default safeHandler(approve);

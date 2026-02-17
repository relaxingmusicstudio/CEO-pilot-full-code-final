import { safeHandler } from "../src/kernel/apiJson.js";
import dbSmoke from "../api_handlers/db-smoke.js";

export const config = { runtime: "nodejs" };

export default safeHandler(dbSmoke);

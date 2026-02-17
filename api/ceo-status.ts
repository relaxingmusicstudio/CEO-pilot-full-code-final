import { safeHandler } from "../src/kernel/apiJson.js";
import ceoStatus from "../api_handlers/ceo-status.js";

export const config = { runtime: "nodejs" };

export default safeHandler(ceoStatus);

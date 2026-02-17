import { safeHandler } from "../src/kernel/apiJson.js";
import ceoDecide from "../api_handlers/ceo-decide.js";

export const config = { runtime: "nodejs" };

export default safeHandler(ceoDecide);

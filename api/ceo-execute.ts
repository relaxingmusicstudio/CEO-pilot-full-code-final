import { safeHandler } from "../src/kernel/apiJson.js";
import ceoExecute from "../api_handlers/ceo-execute.js";

export const config = { runtime: "nodejs" };

export default safeHandler(ceoExecute);

import { safeHandler } from "../src/kernel/apiJson.js";
import proof from "../api_handlers/proof.js";

export const config = { runtime: "nodejs" };

export default safeHandler(proof);

import { safeHandler } from "../src/kernel/apiJson.js";
import review from "../api_handlers/review.js";

export const config = { runtime: "nodejs" };

export default safeHandler(review);

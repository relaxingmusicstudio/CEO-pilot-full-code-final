import { safeHandler } from "../src/kernel/apiJson.js";
import kernelTelemetry from "../api_handlers/kernel-telemetry.js";

export const config = { runtime: "nodejs" };

export default safeHandler(kernelTelemetry);

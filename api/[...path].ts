import { jsonErr } from "../src/kernel/apiJson.js";
import { routeApiRequest } from "../api_handlers/router.js";

export const config = { runtime: "nodejs" };

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const setCorsHeaders = (res: ApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    await routeApiRequest(req, res);
  } catch (error) {
    setCorsHeaders(res);
    const message = error instanceof Error ? error.message : "router_failed";
    jsonErr(res, 500, "router_failed", "router_failed", { error: message });
  }
}

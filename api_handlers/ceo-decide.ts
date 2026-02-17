import { randomUUID } from "node:crypto";
import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

type ApiRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const readJsonBody = async (req: ApiRequest) => {
  let raw = "";
  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  await readJsonBody(req);

  jsonOk(res, {
    ok: true,
    decision: "execute",
    planId: randomUUID(),
    timestamp: new Date().toISOString(),
  });
}

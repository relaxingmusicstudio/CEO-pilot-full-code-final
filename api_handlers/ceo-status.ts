import { jsonErr, jsonOk } from "../src/kernel/apiJson.js";

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET") {
    jsonErr(res, 405, "method_not_allowed", "method_not_allowed");
    return;
  }

  jsonOk(res, {
    ok: true,
    ceo: "active",
    kernelLinked: true,
    timestamp: new Date().toISOString(),
  });
}

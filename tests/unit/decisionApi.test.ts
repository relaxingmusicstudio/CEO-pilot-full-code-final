import { afterEach, describe, expect, it, vi } from "vitest";
import decisionFeedbackHandler from "../../api/decision-feedback";
import diagDecisionWriteHandler from "../../api/diag-decision-write";
import searchDecisionHandler from "../../api/search-decision";
import { ZERO_UUID } from "../../src/lib/decisionValidation";

type MockResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const createMockRes = () => {
  let body = "";
  const headers = new Map<string, string>();
  const res: MockResponse = {
    statusCode: 0,
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    },
    end: (chunk?: string) => {
      if (chunk) body += chunk;
    },
  };
  return {
    res,
    getBody: () => body,
    getStatus: () => res.statusCode,
    getHeaders: () => headers,
  };
};

const parseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const originalEnv = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
};

const mockFetchOk = (body: string, status = 201) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status,
    text: async () => body,
    headers: { get: () => "application/json" },
  });

describe("decision API endpoints", () => {
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects zero UUID decision feedback", async () => {
    const { res, getBody, getStatus } = createMockRes();
    const req = {
      method: "POST",
      body: { decision_id: ZERO_UUID, outcome: "worked" },
    };

    await decisionFeedbackHandler(req as never, res as never);

    const payload = parseJson(getBody());
    expect(getStatus()).toBe(400);
    expect(payload?.ok).toBe(false);
    expect(payload?.code).toBe("bad_request");
  });

  it("rejects invalid decision feedback outcome", async () => {
    const { res, getBody, getStatus } = createMockRes();
    const req = {
      method: "POST",
      body: { decision_id: "11111111-1111-1111-1111-111111111111", outcome: "nope" },
    };

    await decisionFeedbackHandler(req as never, res as never);

    const payload = parseJson(getBody());
    expect(getStatus()).toBe(400);
    expect(payload?.ok).toBe(false);
    expect(payload?.code).toBe("bad_request");
  });

  it("returns a decision_id from search-decision", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    vi.stubGlobal("fetch", mockFetchOk(JSON.stringify([{ id: "stub" }])));

    const { res, getBody, getStatus } = createMockRes();
    const req = { method: "POST", body: { query: "HVAC response times in Austin", mode: "mock" } };

    await searchDecisionHandler(req as never, res as never);

    const payload = parseJson(getBody());
    expect(getStatus()).toBe(200);
    expect(payload?.ok).toBe(true);
    const decision = payload?.decision as { decision_id?: string } | undefined;
    expect(decision?.decision_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("returns JSON shape for diag-decision-write", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    vi.stubGlobal("fetch", mockFetchOk(JSON.stringify([{ id: "stub" }])));

    const { res, getBody, getStatus } = createMockRes();
    const req = { method: "GET" };

    await diagDecisionWriteHandler(req as never, res as never);

    const payload = parseJson(getBody());
    expect(getStatus()).toBe(200);
    expect(payload?.ok).toBe(true);
    expect(payload?.writeOk).toBe(true);
    expect(payload?.urlHost).toBe("example.supabase.co");
    expect(typeof payload?.timingMs).toBe("number");
  });
});

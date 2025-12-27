import { describe, expect, it } from "vitest";
import { buildEvidenceRef, validateEvidenceRef } from "../../src/lib/revenueKernel/evidence";
import { applyOptOut, type LeadConsentState } from "../../src/lib/revenueKernel/consent";
import { buildReachabilityProfile, canUseChannel, selectChannel } from "../../src/lib/revenueKernel/reachability";
import { checkThrottle } from "../../src/lib/revenueKernel/throttle";
import { mergeLeads } from "../../src/lib/revenueKernel/leadMerge";
import { buildQualificationPlan, transitionStage } from "../../src/lib/revenueKernel/stages";
import { runPipelineStep } from "../../src/lib/revenueKernel/pipeline";
import { IrreversibilityMap, ActionImpact } from "../../src/lib/irreversibilityMap";
import { ZOOM_GUARANTEES, ZOOM_EDGES } from "../../src/lib/revenueKernel/zoomPass";
import { computeActionId, type ActionSpec } from "../../src/types/actions";
import { appendCapacityEvent } from "../../src/lib/revenueKernel/capacityLedger";
import { buildTestAgentContext } from "./helpers/agentContext";

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

const getGlobalWithWindow = () =>
  globalThis as typeof globalThis & { window?: { localStorage: ReturnType<typeof createMemoryStorage> } };

const makeAction = (overrides: Partial<Omit<ActionSpec, "action_id">>): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Test action",
    intent_id: "intent-test",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    costUnits: 2,
    costCategory: "compute",
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("evidence schema", () => {
  it("creates valid evidence refs", () => {
    const action = makeAction({ action_type: "email", payload: { to: "a@b.com" } });
    const ref = buildEvidenceRef({
      action,
      provider: "mock",
      mode: "MOCK",
      timestamp: "s1",
    });
    const validation = validateEvidenceRef(ref);
    expect(validation.ok).toBe(true);
    expect(ref.status).toBe("mock");
  });
});

describe("zoom pass", () => {
  it("lists required guarantees and edges", () => {
    expect(ZOOM_GUARANTEES.find((g) => g.id === "intent_before_execution")).toBeTruthy();
    expect(ZOOM_EDGES.find((e) => e.id === "consent_opt_out")).toBeTruthy();
  });
});

describe("consent + opt-out", () => {
  it("opt-out is irreversible", () => {
    const consent: LeadConsentState = { consent_status: "unknown", do_not_contact: false };
    const evidence = buildEvidenceRef({
      action: makeAction({ action_type: "note" }),
      provider: "mock",
      mode: "MOCK",
      timestamp: "s1",
    });
    const first = applyOptOut("lead-1", consent, evidence, "s1");
    expect(first.next.do_not_contact).toBe(true);
    const second = applyOptOut("lead-1", first.next, evidence, "s2");
    expect(second.blocked).toBe(true);
  });

  it("opt-out is classified as irreversible", () => {
    expect(IrreversibilityMap.lead_opt_out).toBe(ActionImpact.IRREVERSIBLE);
  });
});

describe("reachability guards", () => {
  it("blocks SMS for landline/unknown", () => {
    const landline = buildReachabilityProfile({
      phones: [{ e164: "+15550001111", type: "landline", verified: true }],
      email: "a@b.com",
      consent_status: "granted",
    });
    expect(canUseChannel(landline, "sms").ok).toBe(false);

    const unknown = buildReachabilityProfile({
      phones: [{ e164: "+15550002222", type: "unknown", verified: false }],
      email: "a@b.com",
      consent_status: "granted",
    });
    expect(canUseChannel(unknown, "sms").ok).toBe(false);
  });

  it("selects fallback channel when available", () => {
    const profile = buildReachabilityProfile({
      phones: [{ e164: "+15550003333", type: "landline", verified: true }],
      email: "a@b.com",
      consent_status: "granted",
    });
    expect(selectChannel(profile).channel).toBe("voice");
  });
});

describe("throttle caps", () => {
  it("caps win over additional attempts", () => {
    const result = checkThrottle(
      {
        caps: { perDay: 1, perHour: 1 },
        warmup: { enabled: false, rampLimit: 1 },
        countsByKey: { "sms:default": { dayCount: 1, hourCount: 0 } },
      },
      "sms:default"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("CAP_DAILY");
  });
});

describe("lead merge", () => {
  it("merges deterministically by normalized key", () => {
    const existing = [
      { id: "a", email: "Lead@Example.com", phone: "", created_at: "s1" },
    ];
    const incoming = { id: "b", email: "lead@example.com", phone: "555-111", created_at: "s2" };
    const result = mergeLeads(existing, incoming, "s3");
    expect(result.mergeEvent?.primary_id).toBe("a");
    expect(result.mergeEvent?.merged_ids).toContain("b");
  });
});

describe("pipeline safety", () => {
  it("safe-holds live outbound without response_id", async () => {
    const action = makeAction({ action_type: "email", payload: { to: "a@b.com" } });
    const result = await runPipelineStep({
      action,
      identity: { userId: "u1" },
      policyContext: { mode: "LIVE", trustLevel: 0 },
      agentContext: buildTestAgentContext(action.action_type),
      consent: { consent_status: "granted", do_not_contact: false },
      reachability: buildReachabilityProfile({
        phones: [],
        email: "a@b.com",
        consent_status: "granted",
      }),
    });
    expect(result.outcome.type).toBe("halted");
    expect(result.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
  });

  it("blocks outreach when no reachable channels", async () => {
    const action = makeAction({ action_type: "sms", payload: { to: "555" } });
    const result = await runPipelineStep({
      action,
      identity: { userId: "u1" },
      policyContext: { mode: "MOCK", trustLevel: 1 },
      agentContext: buildTestAgentContext(action.action_type),
      consent: { consent_status: "granted", do_not_contact: false },
      reachability: buildReachabilityProfile({
        phones: [],
        email: "",
        consent_status: "granted",
      }),
    });
    expect(result.outcome.type).toBe("halted");
    expect(result.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
  });

  it("defers when capacity is exceeded", async () => {
    const storage = createMemoryStorage();
    const globalWithWindow = getGlobalWithWindow();
    const priorWindow = globalWithWindow.window;
    globalWithWindow.window = { localStorage: storage };
    try {
      const podId = "pod-1";
      const evidence = buildEvidenceRef({
        action: makeAction({ action_type: "note" }),
        provider: "mock",
        mode: "MOCK",
        timestamp: "s1",
      });
      appendCapacityEvent(
        podId,
        {
          pod_id: podId,
          timestamp: "s1",
          type: "configure",
          reason: "init",
          config: { max_concurrent_actions: 1, recovery_rate: 1 },
          evidence_ref: evidence,
        },
        storage
      );
      appendCapacityEvent(
        podId,
        {
          pod_id: podId,
          timestamp: "s2",
          type: "load_inc",
          reason: "busy",
          delta: 1,
          evidence_ref: evidence,
        },
        storage
      );

      const result = await runPipelineStep({
        action: makeAction({ action_type: "task" }),
        identity: { userId: "u1" },
        podId,
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext("task"),
      });

      expect(result.outcome.type).toBe("deferred");
      expect(result.outcome.summary).toContain("FAIL_CAPACITY_EXCEEDED");
    } finally {
      if (priorWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = priorWindow;
      }
    }
  });

  it("blocks new opportunities during cooling", async () => {
    const storage = createMemoryStorage();
    const globalWithWindow = getGlobalWithWindow();
    const priorWindow = globalWithWindow.window;
    globalWithWindow.window = { localStorage: storage };
    try {
      const podId = "pod-2";
      const result = await runPipelineStep({
        action: makeAction({ action_type: "task" }),
        identity: { userId: "u2" },
        podId,
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext("task"),
        opportunity: { window_id: "window-1", is_new: true, opportunity_id: "opp-1", cooldown_satisfied: false },
      });

      expect(result.outcome.type).toBe("deferred");
      expect(result.outcome.summary).toContain("FAIL_COOLDOWN_ACTIVE");
    } finally {
      if (priorWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = priorWindow;
      }
    }
  });

  it("blocks growth actions during repair", async () => {
    const storage = createMemoryStorage();
    const globalWithWindow = getGlobalWithWindow();
    const priorWindow = globalWithWindow.window;
    globalWithWindow.window = { localStorage: storage };
    try {
      const podId = "pod-3";
      const result = await runPipelineStep({
        action: makeAction({ action_type: "task" }),
        identity: { userId: "u3" },
        podId,
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext("task"),
        actionClass: "growth",
        coolingSignal: "repair",
      });

      expect(result.outcome.type).toBe("halted");
      expect(result.outcome.summary).toContain("FAIL_SAFE_OVERLOAD");
    } finally {
      if (priorWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = priorWindow;
      }
    }
  });
});

describe("stage transitions", () => {
  it("moves to warm on contact attempt", () => {
    const result = transitionStage("cold", "contact_attempted", "s1", "outreach started");
    expect(result.nextStage).toBe("warm");
  });

  it("supports no-meetings qualification", () => {
    const plan = buildQualificationPlan("no_meetings");
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});

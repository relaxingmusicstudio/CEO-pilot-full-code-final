import { describe, expect, it } from "vitest";
import { runPipelineStep } from "../../src/lib/revenueKernel/pipeline";
import { buildEvidenceRef } from "../../src/lib/revenueKernel/evidence";
import { applyOptOut } from "../../src/lib/revenueKernel/consent";
import { buildReachabilityProfile } from "../../src/lib/revenueKernel/reachability";
import { appendRetryEvent, getRetryState } from "../../src/lib/revenueKernel/retryDecay";
import { getOpportunityQueue } from "../../src/lib/revenueKernel/opportunityQueue";
import { getCapacityEnergyState } from "../../src/lib/revenueKernel/capacityEnergy";
import { computeIdentityKey } from "../../src/lib/spine";
import { loadRevenueLedgerPage } from "../../src/lib/revenueKernel/ledger";
import { computeActionId, type ActionSpec } from "../../src/types/actions";
import { buildTestAgentContext } from "./helpers/agentContext";

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    size: () => store.size,
  };
};

const withStorage = async <T>(storage: ReturnType<typeof createMemoryStorage>, fn: () => Promise<T>) => {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { localStorage: ReturnType<typeof createMemoryStorage> };
  };
  const priorWindow = globalWithWindow.window;
  globalWithWindow.window = { localStorage: storage };
  try {
    return await fn();
  } finally {
    if (priorWindow === undefined) {
      delete globalWithWindow.window;
    } else {
      globalWithWindow.window = priorWindow;
    }
  }
};

const makeAction = (overrides: Partial<Omit<ActionSpec, "action_id">>): ActionSpec => {
  const base: Omit<ActionSpec, "action_id"> = {
    action_type: "task",
    description: "Edge action",
    intent_id: "intent-edge",
    expected_metric: "metric",
    risk_level: "low",
    irreversible: false,
    payload: {},
    ...overrides,
  };
  return { ...base, action_id: computeActionId(base) };
};

describe("interaction edge cases", () => {
  it("blocks execution when policy conflicts", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "email", payload: { to: "a@b.com" } });
      const result = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "OFFLINE", trustLevel: 0 },
        agentContext: buildTestAgentContext(action.action_type),
        consent: { consent_status: "granted", do_not_contact: false },
        reachability: buildReachabilityProfile({
          phones: [],
          email: "a@b.com",
          consent_status: "granted",
        }),
      });
      expect(result.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });

  it("blocks execution when evidence is missing in LIVE", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
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
      expect(result.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });

  it("preserves evidence when consent is revoked later", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "email", payload: { to: "a@b.com", leadId: "lead-1" } });
      const identity = { userId: "u1", email: "u1@example.com" };
      const consent = { consent_status: "granted", do_not_contact: false };
      const first = await runPipelineStep({
        action,
        identity,
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        consent,
        reachability: buildReachabilityProfile({
          phones: [],
          email: "a@b.com",
          consent_status: "granted",
        }),
      });
      expect(first.outcome.type).toBe("executed");

      const evidence = buildEvidenceRef({
        action,
        provider: "mock",
        mode: "MOCK",
        timestamp: "s1",
      });
      const optOut = applyOptOut("lead-1", consent, evidence, "s2");
      const second = await runPipelineStep({
        action,
        identity,
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        consent: optOut.next,
        reachability: buildReachabilityProfile({
          phones: [],
          email: "a@b.com",
          consent_status: "granted",
        }),
      });
      expect(second.outcome.summary).toContain("FAIL_POLICY_CONFLICT");

      const identityKey = computeIdentityKey(identity.userId, identity.email);
      const ledger = loadRevenueLedgerPage(identityKey, 10, null, storage).entries;
      expect(ledger[0].outcome.type).toBe("executed");
    });
  });

  it("blocks multi-pod contention via soft locks", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task", payload: { leadId: "lead-2" } });
      const first = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        podId: "pod-a",
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        resourceId: "lead-2",
        resourceAutoRelease: false,
      });
      expect(first.outcome.type).toBe("executed");

      const second = await runPipelineStep({
        action,
        identity: { userId: "u2" },
        podId: "pod-b",
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        resourceId: "lead-2",
      });
      expect(second.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });

  it("treats founder pod the same as other pods", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task", payload: { leadId: "lead-3" } });
      await runPipelineStep({
        action,
        identity: { userId: "u1" },
        podId: "pod-owner",
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        resourceId: "lead-3",
        resourceAutoRelease: false,
      });

      const founderAttempt = await runPipelineStep({
        action,
        identity: { userId: "founder" },
        podId: "founder",
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        resourceId: "lead-3",
      });
      expect(founderAttempt.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });

  it("idles without mutating storage over long periods", () => {
    const storage = createMemoryStorage();
    const initialSize = storage.size();
    for (let i = 0; i < 30; i += 1) {
      const dayId = `day-${i}`;
      getCapacityEnergyState("pod-1", "human-1", "task", dayId, undefined, storage);
      getOpportunityQueue("pod-1", storage);
    }
    expect(storage.size()).toBe(initialSize);
  });

  it("retry decay grows cooldown without shrinking", () => {
    const storage = createMemoryStorage();
    const retryKey = "retry-1";
    let lastCooldown = 0;
    for (let i = 0; i < 30; i += 1) {
      appendRetryEvent(retryKey, "halted", "failure", storage);
      const state = getRetryState(retryKey, 1, storage);
      expect(state.required_cooldown_steps).toBeGreaterThanOrEqual(lastCooldown);
      lastCooldown = state.required_cooldown_steps;
    }
    expect(lastCooldown).toBeGreaterThan(0);
  });

  it("enforces chain depth limits", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task", payload: { thread_id: "thread-1" } });
      await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        threadId: "thread-1",
        chainMaxDepth: 2,
      });
      await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        threadId: "thread-1",
        chainMaxDepth: 2,
      });
      const third = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        threadId: "thread-1",
        chainMaxDepth: 2,
      });
      expect(third.outcome.summary).toContain("FAIL_SAFE_OVERLOAD");
    });
  });

  it("requires handoff token for cross-module triggers", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task", payload: { handoff_required: true } });
      const blocked = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        handoffRequired: true,
      });
      expect(blocked.outcome.summary).toContain("FAIL_POLICY_CONFLICT");

      const allowed = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        handoffRequired: true,
        handoffToken: "handoff-ok",
        retryCooldownSatisfied: true,
      });
      expect(allowed.outcome.type).toBe("executed");
    });
  });

  it("prevents auto-help repeats without acknowledgment", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task", payload: { auto_help: true, thread_id: "thread-auto" } });
      const first = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        threadId: "thread-auto",
        autoHelp: true,
      });
      expect(first.outcome.type).toBe("executed");

      const second = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        threadId: "thread-auto",
        autoHelp: true,
      });
      expect(second.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });

  it("blocks sensitive data triggers without acknowledgment", async () => {
    const storage = createMemoryStorage();
    await withStorage(storage, async () => {
      const action = makeAction({ action_type: "task" });
      const blocked = await runPipelineStep({
        action,
        identity: { userId: "u1" },
        policyContext: { mode: "MOCK", trustLevel: 1 },
        agentContext: buildTestAgentContext(action.action_type),
        sensitive: {
          categories: ["medical"],
          acknowledged: false,
          triggersAction: true,
        },
      });
      expect(blocked.outcome.summary).toContain("FAIL_POLICY_CONFLICT");
    });
  });
});

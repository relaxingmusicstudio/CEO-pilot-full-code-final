import { runScheduler } from "../src/lib/ceoPilot/scheduler";

const identityKey = process.env.SCHEDULER_IDENTITY_KEY ?? "system";
const mode = process.env.SCHEDULER_MODE as "MOCK" | "LIVE" | "OFFLINE" | undefined;
const maxTasks = process.env.SCHEDULER_MAX_TASKS ? Number.parseInt(process.env.SCHEDULER_MAX_TASKS, 10) : undefined;

const policyContext = mode
  ? {
      mode,
      trustLevel: mode === "MOCK" ? 1 : 0,
    }
  : undefined;

runScheduler({ identityKey, maxTasks, policyContext })
  .then((summary) => {
    console.log(`[scheduler] identity=${identityKey} processed=${summary.processed} executed=${summary.executed} deferred=${summary.deferred} failed=${summary.failed}`);
  })
  .catch((error) => {
    console.error("[scheduler] failed", error);
    process.exitCode = 1;
  });

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const envUrl = process.env.VERCEL_URL;

const resolveBase = () => {
  if (input) return input;
  if (envUrl) {
    if (envUrl.startsWith("http")) return envUrl;
    return `https://${envUrl}`;
  }
  return "https://pipe-profit-pilot.vercel.app";
};

const base = resolveBase().replace(/\/+$/, "");
const stateDir = ".ops";
const statePath = path.join(stateDir, "uptime-state.json");

const nowIso = () => new Date().toISOString();
const hourKey = () => new Date().toISOString().slice(0, 13);

const TASKS = [
  { id: "health", path: "/api/health", critical: true },
  { id: "build", path: "/api/build", critical: true },
  { id: "routes", path: "/api/_routes", critical: false },
  { id: "diag", path: "/api/diag", critical: false },
  { id: "audit", path: "/api/audit/run", critical: false },
  { id: "kernel", path: "/api/kernel/status", critical: true },
];

const CIRCUIT_THRESHOLD = 2;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const WATCHDOG_STALE_MS = 10 * 60 * 1000;

const loadState = () => {
  const fallback = {
    processed: {},
    circuits: {},
    watchdog: { lastTickAt: null, missed: 0, lastOkAt: null },
    safeMode: { mode: "normal", reason: "init", since: nowIso() },
  };
  if (!fs.existsSync(statePath)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      ...fallback,
      ...parsed,
      processed: parsed.processed ?? fallback.processed,
      circuits: parsed.circuits ?? fallback.circuits,
      watchdog: parsed.watchdog ?? fallback.watchdog,
      safeMode: parsed.safeMode ?? fallback.safeMode,
    };
  } catch {
    return fallback;
  }
};

const saveState = (state) => {
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
};

const parseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const fetchJsonCheck = async (url) => {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const raw = await response.text();
  const parsed = parseJson(raw);
  const ok = response.ok && parsed && parsed.ok !== false;
  return {
    ok,
    status: response.status,
    error: parsed?.error || parsed?.errorCode || (!parsed ? "non_json" : null),
    bodyPreview: parsed ? null : raw.slice(0, 200),
  };
};

const resolveCircuit = (state, id) => {
  if (!state.circuits[id]) {
    state.circuits[id] = { state: "closed", failureCount: 0, openedAt: null, lastFailureAt: null };
  }
  return state.circuits[id];
};

const canRunCircuit = (circuit, now) => {
  if (circuit.state !== "open") return true;
  if (!circuit.openedAt) return false;
  return now - circuit.openedAt >= CIRCUIT_COOLDOWN_MS;
};

const recordSuccess = (circuit) => {
  circuit.state = "closed";
  circuit.failureCount = 0;
  circuit.lastFailureAt = null;
  circuit.openedAt = null;
};

const recordFailure = (circuit, now) => {
  circuit.failureCount += 1;
  circuit.lastFailureAt = now;
  if (circuit.failureCount >= CIRCUIT_THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = now;
  }
};

const run = async () => {
  const state = loadState();
  const now = Date.now();
  const key = hourKey();

  const lastTickAt = state.watchdog?.lastTickAt ? Date.parse(state.watchdog.lastTickAt) : null;
  const watchdogStale = lastTickAt ? now - lastTickAt > WATCHDOG_STALE_MS : false;
  if (watchdogStale) {
    state.watchdog.missed = (state.watchdog.missed ?? 0) + 1;
  }

  const summary = {
    base,
    ok: true,
    failures: 0,
    skipped: 0,
    results: [],
  };

  for (const task of TASKS) {
    const idempotencyKey = `${task.id}:${key}`;
    if (state.processed[idempotencyKey]) {
      summary.skipped += 1;
      summary.results.push({ task: task.id, status: "skipped_idempotent" });
      continue;
    }

    const circuit = resolveCircuit(state, task.id);
    if (!canRunCircuit(circuit, now)) {
      summary.skipped += 1;
      summary.results.push({ task: task.id, status: "skipped_circuit_open" });
      continue;
    }

    const url = `${base}${task.path}`;
    try {
      const result = await fetchJsonCheck(url);
      if (!result.ok) {
        summary.ok = false;
        summary.failures += 1;
        recordFailure(circuit, now);
        state.processed[idempotencyKey] = {
          status: "failed",
          detail: result.error || `status_${result.status}`,
          completedAt: nowIso(),
        };
        summary.results.push({ task: task.id, status: "failed", detail: result.error });
      } else {
        recordSuccess(circuit);
        state.processed[idempotencyKey] = { status: "ok", completedAt: nowIso() };
        summary.results.push({ task: task.id, status: "ok" });
      }
    } catch (error) {
      summary.ok = false;
      summary.failures += 1;
      recordFailure(circuit, now);
      state.processed[idempotencyKey] = {
        status: "failed",
        detail: error instanceof Error ? error.message : "fetch_failed",
        completedAt: nowIso(),
      };
      summary.results.push({ task: task.id, status: "failed", detail: "fetch_failed" });
    }
  }

  const hasOpenCritical = TASKS.some(
    (task) => task.critical && state.circuits[task.id]?.state === "open"
  );
  const hasOpenAny = TASKS.some((task) => state.circuits[task.id]?.state === "open");
  const nextMode =
    watchdogStale || hasOpenCritical ? "safe" : hasOpenAny || summary.failures > 0 ? "degraded" : "normal";
  const previousMode = state.safeMode?.mode ?? "normal";
  state.safeMode = {
    mode: nextMode,
    reason: watchdogStale
      ? "watchdog_stale"
      : hasOpenCritical
        ? "critical_circuit_open"
        : hasOpenAny
          ? "circuit_open"
          : summary.failures > 0
            ? "check_failures"
            : "ok",
    since: nextMode === previousMode ? state.safeMode?.since ?? nowIso() : nowIso(),
  };

  state.watchdog.lastTickAt = nowIso();
  if (summary.ok) {
    state.watchdog.lastOkAt = nowIso();
  }

  saveState(state);

  console.log(JSON.stringify({ ...summary, safeMode: state.safeMode, watchdog: state.watchdog }, null, 2));

  if (!summary.ok || state.safeMode.mode !== "normal") {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("[ops-tick] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

import { loadDoNextState } from "@/lib/ceoChecklist";
import { loadBuildOutput } from "@/lib/fsRealityCheck";
import { loadSystemMode, SystemMode } from "@/lib/systemMode";

export type FobScriptRun = {
  command: string;
  stdoutPath: string | null;
  stderrPath: string | null;
};

export type FobPlaywrightSummary = {
  passed: number | null;
  failed: number | null;
  failingTests: string[];
  rawSummaryLine: string | null;
};

export type FailureOutputPacket = {
  id: string;
  createdAt: string;
  gitCommitHash: string;
  ciRunUrl: string | null;
  scripts: FobScriptRun[];
  playwright: FobPlaywrightSummary | null;
  logs: { capturePath: string | null; tailLines: string[] };
  appInfo: {
    appVersion: string;
    buildTimestamp: string;
    commitShaEnv: string;
    mode: string;
    baseUrl: string;
    userAgent: string;
  };
};

export type MaintenanceHealthReport = {
  generatedAt: string;
  period: "daily" | "weekly";
  systemMode: SystemMode;
  lastDoNext: { taskId: string; title: string } | null;
  failingTestsTrend: { failingRuns: number; failingTests: string[] };
  ciStatusTrend: string;
  ciRunUrls: string[];
  recommendedAction: string;
};

export type MaintenanceReportBundle = {
  generatedAt: string;
  daily: MaintenanceHealthReport;
  weekly: MaintenanceHealthReport;
};

const FOB_HISTORY_PREFIX = "ppp:maintenanceFobHistory:v1::";

const makeKey = (prefix: string, userId?: string | null, email?: string | null) =>
  `${prefix}${userId || email || "anonymous"}`;

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const tailLines = (text: string, count: number): string[] => {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - count));
};

const readEnvString = (key: string): string | null => {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const value = env?.[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
};

const uniqueFirstN = (values: string[], n: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
};

export const parsePlaywrightOutput = (output: string): FobPlaywrightSummary | null => {
  if (!output) return null;

  const passedMatch = output.match(/(\d+)\s+passed\b/i);
  const failedMatch = output.match(/(\d+)\s+failed\b/i);
  const passed = passedMatch ? Number.parseInt(passedMatch[1], 10) : null;
  const failed = failedMatch ? Number.parseInt(failedMatch[1], 10) : null;

  const failingTests: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^(?:\u2718|x)\s+(.*)$/i);
    const okPrefix = trimmed.match(/^ok\s+\d+\s+(.*)$/i);
    if (bullet?.[1]) {
      failingTests.push(bullet[1].trim());
    } else if (okPrefix?.[1] && /failed/i.test(trimmed)) {
      failingTests.push(okPrefix[1].trim());
    }
  }

  const summaryLine =
    output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\bpassed\b/i.test(l) || /\bfailed\b/i.test(l)) ?? null;

  if (passed === null && failed === null && failingTests.length === 0) return null;

  return {
    passed,
    failed,
    failingTests: uniqueFirstN(failingTests, 50),
    rawSummaryLine: summaryLine,
  };
};

export const createFailureOutputPacket = (args: {
  ciRunUrl?: string | null;
  scripts?: FobScriptRun[];
  playwrightOutput?: string | null;
  logsText?: string | null;
  logsCapturePath?: string | null;
}): FailureOutputPacket => {
  const createdAt = new Date().toISOString();

  const commitSha = readEnvString("VITE_COMMIT_SHA") ?? readEnvString("VITE_GIT_COMMIT_SHA") ?? "(missing)";
  const buildTimestamp = readEnvString("VITE_BUILD_TIMESTAMP") ?? "(missing)";
  const appVersion = readEnvString("VITE_APP_VERSION") ?? "1.0.0";
  const ciRunUrl = args.ciRunUrl?.trim() || readEnvString("VITE_CI_RUN_URL") || null;

  const playwright = args.playwrightOutput ? parsePlaywrightOutput(args.playwrightOutput) : null;

  const logsSource = (args.logsText ?? "").trim();
  const buildOutput = loadBuildOutput();
  const logsText = logsSource.length > 0 ? logsSource : buildOutput;

  return {
    id: `fob-${createdAt}`,
    createdAt,
    gitCommitHash: commitSha,
    ciRunUrl,
    scripts: args.scripts ?? [],
    playwright,
    logs: {
      capturePath: args.logsCapturePath?.trim() || null,
      tailLines: tailLines(logsText, 200),
    },
    appInfo: {
      appVersion,
      buildTimestamp,
      commitShaEnv: commitSha,
      mode: import.meta.env.MODE,
      baseUrl: import.meta.env.BASE_URL,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "(unknown)",
    },
  };
};

export const loadFobHistory = (userId?: string | null, email?: string | null): FailureOutputPacket[] => {
  if (typeof window === "undefined") return [];
  const key = makeKey(FOB_HISTORY_PREFIX, userId, email);
  const parsed = safeJsonParse<FailureOutputPacket[]>(window.localStorage.getItem(key));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(Boolean).slice(0, 20);
};

export const saveFobHistory = (
  history: FailureOutputPacket[],
  userId?: string | null,
  email?: string | null
) => {
  if (typeof window === "undefined") return;
  const key = makeKey(FOB_HISTORY_PREFIX, userId, email);
  window.localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
};

export const recordFobHistoryEntry = (
  entry: FailureOutputPacket,
  userId?: string | null,
  email?: string | null,
  limit = 5
): FailureOutputPacket[] => {
  const history = loadFobHistory(userId, email);
  const next = [entry, ...history].slice(0, limit);
  saveFobHistory(next, userId, email);
  return next;
};

const getLastDoNextTitle = (userId?: string | null, email?: string | null) => {
  const last = loadDoNextState(userId, email);
  if (!last) return null;
  const title =
    last.parsedJson?.title ||
    last.responseMarkdown?.split(/\r?\n/).find((line) => line.trim().length > 0) ||
    last.rawResponse?.split(/\r?\n/).find((line) => line.trim().length > 0) ||
    null;
  return title ? { taskId: last.taskId, title: title.trim() } : { taskId: last.taskId, title: "(unknown)" };
};

const safeLoadSystemMode = (userId?: string | null, email?: string | null): SystemMode => {
  try {
    return loadSystemMode(userId, email);
  } catch {
    return SystemMode.EXECUTION;
  }
};

const summarizeFailingTests = (fobs: FailureOutputPacket[]): { failingRuns: number; failingTests: string[] } => {
  const failingRuns = fobs.filter((f) => (f.playwright?.failed ?? 0) > 0 || (f.playwright?.failingTests?.length ?? 0) > 0).length;
  const failingTests = uniqueFirstN(
    fobs.flatMap((f) => f.playwright?.failingTests ?? []),
    20
  );
  return { failingRuns, failingTests };
};

const recommendAction = (latest: FailureOutputPacket | null, report: { failingTests: string[] }): string => {
  if (!latest) return "Capture a Failure Output Packet (FOB) by pasting Playwright output and logs.";
  const failed = (latest.playwright?.failed ?? 0) > 0 || (latest.playwright?.failingTests?.length ?? 0) > 0;
  if (failed) {
    const names = report.failingTests.length > 0 ? ` (${report.failingTests.join("; ")})` : "";
    return `Fix failing Playwright tests${names}, then re-run mock e2e and capture a new FOB.`;
  }
  return "System is green. Capture a new FOB after any CI/local failure; review weekly trends in Ops Hub.";
};

export const generateMaintenanceReport = (args: {
  userId?: string | null;
  email?: string | null;
  fobHistory: FailureOutputPacket[];
}): MaintenanceReportBundle => {
  const generatedAt = new Date().toISOString();
  const latest = args.fobHistory[0] ?? null;
  const systemMode = safeLoadSystemMode(args.userId, args.email);
  const lastDoNext = getLastDoNextTitle(args.userId, args.email);

  const dailyTrend = summarizeFailingTests(latest ? [latest] : []);
  const weeklyTrend = summarizeFailingTests(args.fobHistory.slice(0, 5));

  const ciRunUrls = uniqueFirstN(
    args.fobHistory.map((f) => f.ciRunUrl || "").filter(Boolean),
    10
  );

  const ciStatusTrend =
    ciRunUrls.length > 0
      ? `CI run URLs captured (${ciRunUrls.length}); status not captured (paste status if needed).`
      : "No CI run URL captured.";

  const daily: MaintenanceHealthReport = {
    generatedAt,
    period: "daily",
    systemMode,
    lastDoNext,
    failingTestsTrend: dailyTrend,
    ciStatusTrend,
    ciRunUrls,
    recommendedAction: recommendAction(latest, dailyTrend),
  };

  const weekly: MaintenanceHealthReport = {
    generatedAt,
    period: "weekly",
    systemMode,
    lastDoNext,
    failingTestsTrend: weeklyTrend,
    ciStatusTrend,
    ciRunUrls,
    recommendedAction: recommendAction(latest, weeklyTrend),
  };

  return { generatedAt, daily, weekly };
};

export const createDeterministicMockFob = (): FailureOutputPacket =>
  createFailureOutputPacket({
    ciRunUrl: null,
    scripts: [
      {
        command: "VITE_MOCK_AUTH=true npm run test:e2e",
        stdoutPath: "test-results/e2e.stdout.txt",
        stderrPath: "test-results/e2e.stderr.txt",
      },
    ],
    playwrightOutput: "9 passed (mock)\n",
    logsText: "Mock mode: no failure logs captured.\n",
    logsCapturePath: null,
  });

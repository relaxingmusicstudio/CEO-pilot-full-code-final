import { Kernel } from "@/kernel/run";

type AnalyticsIntent = "analytics.track_event" | "analytics.upsert_visitor";

export type AnalyticsEventPayload = {
  visitorId: string;
  sessionId: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  pageUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export type VisitorPayload = {
  visitorId: string;
  device?: string;
  browser?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrer?: string;
  gclid?: string;
  fbclid?: string;
};

type AnalyticsQueueItem = {
  id: string;
  intent: AnalyticsIntent;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
};

type AnalyticsStatus = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  queuedCount: number;
};

const QUEUE_KEY = "ppp:analytics_queue";
const STATUS_KEY = "ppp:analytics_status";
const MAX_QUEUE = 100;

let inMemoryQueue: AnalyticsQueueItem[] = [];
let inMemoryStatus: AnalyticsStatus = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  queuedCount: 0,
};

let flushInFlight = false;
let initialized = false;
let flushTimer: number | null = null;

const isBrowser = (): boolean => typeof window !== "undefined";

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readQueue = (): AnalyticsQueueItem[] => {
  if (!isBrowser()) return inMemoryQueue;
  return safeJsonParse<AnalyticsQueueItem[]>(window.localStorage.getItem(QUEUE_KEY), []);
};

const writeQueue = (queue: AnalyticsQueueItem[]) => {
  const trimmed = queue.slice(-MAX_QUEUE);
  if (!isBrowser()) {
    inMemoryQueue = trimmed;
    return;
  }
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
};

const readStatus = (): AnalyticsStatus => {
  if (!isBrowser()) return inMemoryStatus;
  return safeJsonParse<AnalyticsStatus>(window.localStorage.getItem(STATUS_KEY), inMemoryStatus);
};

const writeStatus = (status: AnalyticsStatus) => {
  if (!isBrowser()) {
    inMemoryStatus = status;
    return;
  }
  window.localStorage.setItem(STATUS_KEY, JSON.stringify(status));
};

const updateStatus = (patch: Partial<AnalyticsStatus>) => {
  const current = readStatus();
  const next = { ...current, ...patch };
  writeStatus(next);
};

const queueIntent = (intent: AnalyticsIntent, payload: Record<string, unknown>, error?: string) => {
  const queue = readQueue();
  queue.push({
    id: `aq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    intent,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  writeQueue(queue);
  updateStatus({
    lastError: error ?? "queued",
    queuedCount: queue.length,
  });
  if (isBrowser() && flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flushAnalyticsQueue();
    }, 5000);
  }
};

export const queueEvent = (payload: AnalyticsEventPayload) => {
  queueIntent("analytics.track_event", payload, "queued");
};

export const flushAnalyticsQueue = async () => {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const queue = readQueue();
    if (queue.length === 0) {
      updateStatus({ queuedCount: 0 });
      return;
    }
    const remaining: AnalyticsQueueItem[] = [];
    for (const item of queue) {
      const result = await Kernel.run(item.intent, item.payload, {
        consent: { analytics: true },
        budgetCents: 1,
        maxBudgetCents: 5,
      });
      if (!result.ok) {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    writeQueue(remaining);
    updateStatus({
      queuedCount: remaining.length,
      lastSuccessAt: remaining.length === 0 ? new Date().toISOString() : readStatus().lastSuccessAt,
    });
  } finally {
    flushInFlight = false;
  }
};

export const initAnalyticsQueue = () => {
  if (!isBrowser() || initialized) return;
  initialized = true;
  window.addEventListener("online", () => {
    void flushAnalyticsQueue();
  });
  void flushAnalyticsQueue();
};

export const getAnalyticsStatus = (): AnalyticsStatus => {
  const status = readStatus();
  const queue = readQueue();
  if (status.queuedCount !== queue.length) {
    const next = { ...status, queuedCount: queue.length };
    writeStatus(next);
    return next;
  }
  return status;
};

export const trackEvent = async (payload: AnalyticsEventPayload) => {
  try {
    updateStatus({ lastAttemptAt: new Date().toISOString(), lastError: null });
    const result = await Kernel.run("analytics.track_event", payload, {
      consent: { analytics: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });
    if (!result.ok) {
      queueIntent("analytics.track_event", payload, result.error?.code ?? "kernel_error");
      return;
    }
    updateStatus({ lastSuccessAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "track_event_failed";
    queueIntent("analytics.track_event", payload, message);
  }
};

export const upsertVisitor = async (payload: VisitorPayload) => {
  try {
    updateStatus({ lastAttemptAt: new Date().toISOString(), lastError: null });
    const result = await Kernel.run("analytics.upsert_visitor", payload, {
      consent: { analytics: true },
      budgetCents: 1,
      maxBudgetCents: 5,
    });
    if (!result.ok) {
      queueIntent("analytics.upsert_visitor", payload, result.error?.code ?? "kernel_error");
      return;
    }
    updateStatus({ lastSuccessAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upsert_failed";
    queueIntent("analytics.upsert_visitor", payload, message);
  }
};

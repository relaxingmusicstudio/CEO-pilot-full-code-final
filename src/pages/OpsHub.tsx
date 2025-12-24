import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { envSchema } from "@/lib/envSchema";
import { useAuth } from "@/hooks/useAuth";
import {
  createDeterministicMockFob,
  createFailureOutputPacket,
  FailureOutputPacket,
  generateMaintenanceReport,
  loadFobHistory,
  MaintenanceReportBundle,
  recordFobHistoryEntry,
} from "@/lib/maintenanceFob";
import {
  ThreadAuthorType,
  ThreadEntry,
  ThreadScope,
  ThreadSnapshotSummaryFields,
  ThreadStoreState,
  appendThreadEntry,
  buildThreadSnapshot,
  createThread,
  createThreadStoreState,
  getLatestSnapshot,
  getThreadEntriesPage,
  getThreadSummary,
  saveThreadSnapshot,
} from "@/lib/lifelongThreads";
import { loadThreadStoreState, saveThreadStoreState } from "@/lib/lifelongThreadsStorage";
import { CIV_CONSTITUTION } from "@/lib/policy/constitution";
import { REQUIRED_INVARIANTS } from "@/lib/policy/invariants";
import { computeDriftScore } from "@/lib/policy/driftScore";

type ChecklistState = Record<string, boolean>;

const storageKey = "ops-checklist-v1";

const defaultChecklist: { id: string; title: string; why: string; steps: string; result: string; stuck: string }[] = [
  {
    id: "supabase",
    title: "Supabase project created",
    why: "Auth, storage, and edge functions depend on Supabase.",
    steps: "Create project, grab URL + anon key, store secrets server-side.",
    result: "Supabase URL/anon set in Vercel + local .env, functions deployable.",
    stuck: "Use `npm run ops:doctor` to see missing envs; check DEPLOYMENT.md.",
  },
  {
    id: "vercel-env",
    title: "Vercel env vars set",
    why: "Client must reach Supabase; server secrets stay off the bundle.",
    steps: "Vercel → Project → Settings → Environment Variables → add SUPABASE_URL + SUPABASE_ANON_KEY.",
    result: "Preview/prod can auth without leaking secrets.",
    stuck: "Never use VITE_* for provider keys. Re-run proof gate after changes.",
  },
  {
    id: "twilio-a2p",
    title: "Twilio A2P approved",
    why: "SMS deliverability for notifications.",
    steps: "Register brand/campaign or use toll-free fallback until approved.",
    result: "Notify gateway can send SMS without carrier blocks.",
    stuck: "See docs/TWILIO_A2P.md for fallback paths.",
  },
  {
    id: "twilio-number",
    title: "Twilio number purchased",
    why: "Notify gateway needs a sending number.",
    steps: "Buy number in Twilio; set TWILIO_FROM_NUMBER secret server-side.",
    result: "SMS confirmation/reminders can be sent.",
    stuck: "Keep number in E.164 format; retry ops:doctor to confirm presence.",
  },
  {
    id: "resend",
    title: "Resend domain verified",
    why: "Email confirmations and reminders.",
    steps: "Verify domain in Resend; set RESEND_API_KEY + EMAIL_FROM server-side.",
    result: "Emails send from verified domain.",
    stuck: "Use mock mode until verified; avoid provider sandbox limits.",
  },
  {
    id: "stripe",
    title: "Stripe test mode verified",
    why: "Billing and payments readiness.",
    steps: "Create products or enable test keys; keep keys server-side only.",
    result: "Test charges succeed; live mode gated.",
    stuck: "Run in mock mode if Stripe not ready; never place keys in VITE_*.",
  },
  {
    id: "llm-smoke",
    title: "LLM smoke passes",
    why: "LLM gateway health check.",
    steps: "Run /app/llm-smoke with mock or demo keys; expect OK.",
    result: "Gateway reachable; rate limits respected.",
    stuck: "Use mock mode if demo keys disabled; check llm-gateway logs.",
  },
  {
    id: "notify",
    title: "Notify gateway test passes",
    why: "SMS/email plumbing validated.",
    steps: "Run mock notification from pipeline or gateway test surface.",
    result: "Notify events show mock-sent or sent status.",
    stuck: "Keep allowLive off until A2P + domain verified.",
  },
];

const commandList = [
  { label: "Proof Gate", command: "npm run proofgate" },
  { label: "Ops Doctor", command: "npm run ops:doctor" },
  { label: "Build (mock)", command: "VITE_MOCK_AUTH=true npm run build" },
  { label: "E2E (mock)", command: "VITE_MOCK_AUTH=true npm run test:e2e" },
];

const isMockMode = () =>
  import.meta.env.VITE_MOCK_AUTH === "true" ||
  (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

export default function OpsHub() {
  const { userId, email } = useAuth();
  const ownerKey = userId || email || "anonymous";
  const mock = useMemo(() => isMockMode(), []);
  const driftScore = useMemo(
    () =>
      computeDriftScore({
        invariantViolationsCount: 0,
        prohibitedTargetHitsCount: 0,
        missingIntentCount: 0,
        missingApprovalCount: 0,
      }),
    []
  );
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [fobHistory, setFobHistory] = useState<FailureOutputPacket[]>([]);
  const [selectedFobId, setSelectedFobId] = useState<string | null>(null);
  const [fobCiRunUrl, setFobCiRunUrl] = useState("");
  const [fobScriptCommand, setFobScriptCommand] = useState("VITE_MOCK_AUTH=true npm run test:e2e");
  const [fobStdoutPath, setFobStdoutPath] = useState("test-results/e2e.stdout.txt");
  const [fobStderrPath, setFobStderrPath] = useState("test-results/e2e.stderr.txt");
  const [fobPlaywrightOutput, setFobPlaywrightOutput] = useState("");
  const [fobLogsText, setFobLogsText] = useState("");
  const [fobCopied, setFobCopied] = useState(false);
  const [report, setReport] = useState<MaintenanceReportBundle | null>(null);
  const [threadStore, setThreadStore] = useState<ThreadStoreState>(() => createThreadStoreState());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadEntryText, setThreadEntryText] = useState("Initial thread note");
  const [threadSummary, setThreadSummary] = useState<ThreadSnapshotSummaryFields | null>(null);
  const [threadPageEntries, setThreadPageEntries] = useState<ThreadEntry[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);

  const selectedFob = useMemo(() => {
    if (fobHistory.length === 0) return null;
    return fobHistory.find((f) => f.id === selectedFobId) ?? fobHistory[0];
  }, [fobHistory, selectedFobId]);

  const refreshThreadView = (nextStore: ThreadStoreState, threadId: string | null, cursor: string | null) => {
    if (!threadId) {
      setThreadSummary(null);
      setThreadPageEntries([]);
      setThreadCursor(null);
      return;
    }

    const snapshot = getLatestSnapshot(nextStore.snapshots, threadId);
    setThreadSummary(getThreadSummary(threadId, nextStore.entries, snapshot));

    const page = getThreadEntriesPage(nextStore, {
      thread_id: threadId,
      requester: { owner_id: ownerKey },
      limit: 3,
      cursor,
    });

    if (!page.ok) {
      setThreadPageEntries([]);
      setThreadCursor(null);
      return;
    }

    setThreadPageEntries(page.entries);
    setThreadCursor(page.nextCursor);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      setChecklist(JSON.parse(saved));
    } else {
      const initial: ChecklistState = {};
      defaultChecklist.forEach((item) => (initial[item.id] = false));
      setChecklist(initial);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || Object.keys(checklist).length === 0) return;
    window.localStorage.setItem(storageKey, JSON.stringify(checklist));
  }, [checklist]);

  useEffect(() => {
    const loaded = loadFobHistory(userId, email);
    if (loaded.length === 0 && mock) {
      const seeded = recordFobHistoryEntry(createDeterministicMockFob(), userId, email, 5);
      setFobHistory(seeded);
      setSelectedFobId(seeded[0]?.id ?? null);
      return;
    }
    setFobHistory(loaded);
    setSelectedFobId(loaded[0]?.id ?? null);
  }, [userId, email, mock]);

  useEffect(() => {
    const loaded = loadThreadStoreState(userId, email);
    setThreadStore(loaded);
    setActiveThreadId(loaded.threads[0]?.thread_id ?? null);
  }, [userId, email]);

  useEffect(() => {
    saveThreadStoreState(threadStore, userId, email);
  }, [threadStore, userId, email]);

  useEffect(() => {
    refreshThreadView(threadStore, activeThreadId, null);
  }, [threadStore, activeThreadId, ownerKey]);

  const toggle = (id: string, value: boolean) => {
    setChecklist((prev) => ({ ...prev, [id]: value }));
  };

  const copy = async (cmd: string) => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    } catch (_err) {
      // ignore clipboard permission errors in headless
    }
  };

  const captureFob = () => {
    const scripts = [
      {
        command: fobScriptCommand.trim(),
        stdoutPath: fobStdoutPath.trim() || null,
        stderrPath: fobStderrPath.trim() || null,
      },
    ].filter((s) => s.command.length > 0);

    const nextFob = createFailureOutputPacket({
      ciRunUrl: fobCiRunUrl.trim() || null,
      scripts,
      playwrightOutput: fobPlaywrightOutput.trim() || null,
      logsText: fobLogsText.trim() || null,
      logsCapturePath: null,
    });

    const nextHistory = recordFobHistoryEntry(nextFob, userId, email, 5);
    setFobHistory(nextHistory);
    setSelectedFobId(nextHistory[0]?.id ?? null);
  };

  const copyFobToClipboard = async () => {
    if (!selectedFob) return;
    const text = JSON.stringify(selectedFob, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard permission errors in headless
    }
    setFobCopied(true);
    setTimeout(() => setFobCopied(false), 1500);
  };

  const handleGenerateReport = () => {
    const next = generateMaintenanceReport({ userId, email, fobHistory });
    setReport(next);
  };

  const handleCreateThread = () => {
    const result = createThread(threadStore, {
      owner_id: ownerKey,
      scope: ThreadScope.PRIVATE,
    });
    const snapshot = buildThreadSnapshot(result.thread.thread_id, result.state.entries, result.thread.created_at);
    const nextState = saveThreadSnapshot(result.state, snapshot);
    setThreadStore(nextState);
    setActiveThreadId(result.thread.thread_id);
    refreshThreadView(nextState, result.thread.thread_id, null);
  };

  const handleAppendThreadEntry = () => {
    if (!activeThreadId) return;
    const trimmed = threadEntryText.trim();
    if (!trimmed) return;
    const result = appendThreadEntry(threadStore, {
      thread_id: activeThreadId,
      author_type: ThreadAuthorType.USER,
      content_text: trimmed,
    });
    const snapshot = buildThreadSnapshot(activeThreadId, result.state.entries);
    const nextState = saveThreadSnapshot(result.state, snapshot);
    setThreadStore(nextState);
    refreshThreadView(nextState, activeThreadId, null);
  };

  const handleLoadOlderEntries = () => {
    if (!activeThreadId || !threadCursor) return;
    const page = getThreadEntriesPage(threadStore, {
      thread_id: activeThreadId,
      requester: { owner_id: ownerKey },
      limit: 3,
      cursor: threadCursor,
    });
    if (!page.ok) return;
    setThreadPageEntries(page.entries);
    setThreadCursor(page.nextCursor);
  };

  return (
    <div data-testid="ops-home">
      <div className="container py-8 space-y-6">
        <Helmet>
          <title>Ops Hub</title>
        </Helmet>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
          <h1 className="text-3xl font-bold">Ops Hub</h1>
          <p className="text-muted-foreground">
            Owner-only playbook for deployments, proof gate, and API readiness.
          </p>
        </div>
        <Badge variant={mock ? "secondary" : "default"}>
          {mock ? "Mock mode (safe stubs)" : "Live mode"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Signals to confirm before pushing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Auth mode</span>
              <Badge>{mock ? "Mock auth" : "Live auth"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Proof gate</span>
              <Badge variant="outline">Run before every PR</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Secrets</span>
              <Badge variant="outline">Server-side only</Badge>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="ops-proofgate">
          <CardHeader>
            <CardTitle>Proof Gate Commands</CardTitle>
            <CardDescription>Copy + run locally or in CI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {commandList.map((cmd) => (
              <div key={cmd.command} className="flex items-center justify-between gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded w-full">{cmd.command}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(cmd.command)} data-testid={`cmd-${cmd.command}`}>
                  {copied === cmd.command ? "Copied" : "Copy"}
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Proof gate also scans dist for secret patterns and runs mock e2e.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="ops-policy-drift">
        <CardHeader>
          <CardTitle>Policy / Drift</CardTitle>
          <CardDescription>Read-only constitution + invariants + drift signal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <div className="font-medium">Purpose</div>
            <div className="text-muted-foreground">{CIV_CONSTITUTION.purpose}</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Invariants</div>
            <div className="flex flex-wrap gap-2">
              {REQUIRED_INVARIANTS.map((inv) => (
                <code key={inv.id} className="rounded bg-muted px-2 py-1 text-xs">
                  {inv.id}
                </code>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Drift score</span>
            <Badge variant="outline">{driftScore.toFixed(2)}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="threads-kernel">
        <CardHeader>
          <CardTitle>Lifelong Threads</CardTitle>
          <CardDescription>Private, append-only thread core with paged retrieval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleCreateThread} data-testid="threads-create">
              Create Thread
            </Button>
            <Button
              size="sm"
              onClick={handleAppendThreadEntry}
              disabled={!activeThreadId || threadEntryText.trim().length === 0}
              data-testid="threads-append"
            >
              Append Entry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLoadOlderEntries}
              disabled={!threadCursor}
              data-testid="threads-load-older"
            >
              Load Older
            </Button>
          </div>
          <Input
            value={threadEntryText}
            onChange={(event) => setThreadEntryText(event.target.value)}
            placeholder="Add a deterministic thread note"
            data-testid="threads-entry-input"
          />
          <div className="text-xs text-muted-foreground">Thread: {activeThreadId ?? "none"}</div>
          <div data-testid="threads-summary">
            Entries: {threadSummary?.entry_count ?? 0} | Last updated: {threadSummary?.last_updated ?? "n/a"}
          </div>
          <div className="space-y-2" data-testid="threads-page">
            {threadPageEntries.length === 0 ? (
              <div className="text-xs text-muted-foreground">No entries yet.</div>
            ) : (
              threadPageEntries.map((entry) => (
                <div key={entry.entry_id} className="rounded border border-muted px-3 py-2 text-xs">
                  <div className="font-medium">{entry.author_type}</div>
                  <div className="text-muted-foreground">{entry.content_text}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="ops-api-checklist">
        <CardHeader>
          <CardTitle>API Checklist</CardTitle>
          <CardDescription>Presence only; no secrets are shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {envSchema
            .filter((env) => env.scope === "server" || env.scope === "client")
            .filter((env) => env.requiredFor !== "mock")
            .map((item) => (
              <div key={item.name} className="rounded border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="outline">{mock ? "Mock-ready" : "Check env"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground">Used by: {item.usedBy.join(", ")}</p>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner Checklist</CardTitle>
          <CardDescription>Track readiness without exposing secrets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {defaultChecklist.map((item) => (
            <div key={item.id} className="rounded border p-3 space-y-1" data-testid={`check-${item.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.why}</div>
                </div>
                <Switch
                  checked={Boolean(checklist[item.id])}
                  onCheckedChange={(v) => toggle(item.id, v)}
                  aria-label={item.title}
                />
              </div>
              <div className="text-sm text-muted-foreground">Steps: {item.steps}</div>
              <div className="text-sm text-muted-foreground">Expected: {item.result}</div>
              <div className="text-sm text-muted-foreground">If stuck: {item.stuck}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runbooks & Docs</CardTitle>
          <CardDescription>Quick links for operators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            OPS_PLAYBOOK.md — canonical sequence for deployments and proofs.
          </p>
          <p className="text-sm">
            docs/APIS.md — where to place keys (never in VITE_*), mock vs live minimums.
          </p>
          <p className="text-sm">
            docs/TWILIO_A2P.md — A2P readiness and fallbacks.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="maintenance-home">
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          <CardDescription>Failure Output Packet (FOB) + deterministic health report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Latest FOB: {selectedFob ? new Date(selectedFob.createdAt).toLocaleString() : "(none)"}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={copyFobToClipboard}
                disabled={!selectedFob}
                data-testid="maintenance-copy-fob"
              >
                {fobCopied ? "Copied" : "Copy FOB to Clipboard"}
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateReport}
                disabled={fobHistory.length === 0}
                data-testid="maintenance-generate-report"
              >
                Generate Report
              </Button>
            </div>
          </div>

          {fobHistory.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">FOB history (last 5)</div>
                <div className="grid gap-2">
                  {fobHistory.slice(0, 5).map((entry) => (
                    <Button
                      key={entry.id}
                      variant={selectedFob?.id === entry.id ? "default" : "outline"}
                      size="sm"
                      className="justify-start"
                      onClick={() => setSelectedFobId(entry.id)}
                    >
                      <span className="truncate">
                        {new Date(entry.createdAt).toLocaleString()} —{" "}
                        {entry.playwright?.failed && entry.playwright.failed > 0 ? "FAIL" : "OK"}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Selected FOB JSON</div>
                <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap max-h-64 overflow-auto">
                  {selectedFob ? JSON.stringify(selectedFob, null, 2) : "(none)"}
                </pre>
              </div>
            </div>
          )}

          <div className="rounded border p-3 space-y-3">
            <div className="font-medium">Capture a FOB (manual paste)</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">CI run URL (optional)</div>
                <Input value={fobCiRunUrl} onChange={(e) => setFobCiRunUrl(e.target.value)} placeholder="https://github.com/.../actions/runs/..." />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Script command</div>
                <Input value={fobScriptCommand} onChange={(e) => setFobScriptCommand(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">stdout capture path (optional)</div>
                <Input value={fobStdoutPath} onChange={(e) => setFobStdoutPath(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">stderr capture path (optional)</div>
                <Input value={fobStderrPath} onChange={(e) => setFobStderrPath(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Playwright output (paste)</div>
                <Textarea value={fobPlaywrightOutput} onChange={(e) => setFobPlaywrightOutput(e.target.value)} placeholder="Paste playwright output here..." />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Relevant logs (paste, last 200 lines kept)</div>
                <Textarea value={fobLogsText} onChange={(e) => setFobLogsText(e.target.value)} placeholder="Paste logs here..." />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={captureFob}>
                Save FOB
              </Button>
            </div>
          </div>

          {report && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Health report (daily + weekly)</div>
              <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap max-h-72 overflow-auto">
                {JSON.stringify(report, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

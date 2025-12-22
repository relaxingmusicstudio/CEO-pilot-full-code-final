import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { envSchema } from "@/lib/envSchema";

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
    steps: "Vercel -> Project -> Settings -> Environment Variables -> add SUPABASE_URL + SUPABASE_ANON_KEY.",
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
  const mock = useMemo(() => isMockMode(), []);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [copied, setCopied] = useState<string | null>(null);

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

  return (
    <div className="container py-8 space-y-6" data-testid="ops-home">
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
    </div>
  );
}

import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { envSchema } from "@/lib/envSchema";
import { supabase } from "@/integrations/supabase/client";

const isMockMode = () =>
  import.meta.env.VITE_MOCK_AUTH === "true" ||
  (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

type Status = { label: string; tone: "ok" | "warn" | "error"; detail?: string };

const steps = ["Secrets", "Supabase", "LLM", "Notify", "Stripe"];

const envLocalTemplate = `VITE_MOCK_AUTH=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
`;

const vercelTemplate = `# Server-side only
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=
GEMINI_API_KEY=
LLM_ALLOW_DEMO_KEYS=true
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
RESEND_API_KEY=
EMAIL_FROM=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Client-safe (if used)
VITE_STRIPE_PUBLISHABLE_KEY=
`;

export default function SetupWizard() {
  const mock = useMemo(() => isMockMode(), []);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnon, setSupabaseAnon] = useState("");
  const [supabaseStatus, setSupabaseStatus] = useState<Status | null>(null);
  const [llmStatus, setLlmStatus] = useState<Status | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<Status | null>(null);
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("Thanks for opting in. This is a test.");

  const copy = async (text: string) => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_err) {
      // ignore clipboard permission errors in headless envs
    }
  };

  const testSupabase = async () => {
    if (mock) {
      setSupabaseStatus({ label: "Mock OK", tone: "ok" });
      return;
    }
    if (!supabaseUrl || !supabaseAnon) {
      setSupabaseStatus({ label: "Missing URL or anon key", tone: "warn" });
      return;
    }
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: supabaseAnon },
      });
      if (resp.status >= 200 && resp.status < 500) {
        setSupabaseStatus({ label: `Reachable (${resp.status})`, tone: "ok" });
      } else {
        setSupabaseStatus({ label: `Unexpected status ${resp.status}`, tone: "warn" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      setSupabaseStatus({ label: "Network error", tone: "error", detail: message });
    }
  };

  const runLlmSmoke = async () => {
    setLlmStatus({ label: "Running...", tone: "warn" });
    try {
      const { data, error } = await supabase.functions.invoke("llm-gateway", {
        body: {
          provider: "gemini",
          task: "setup-smoke",
          input: "Return only the word OK.",
          meta: { allowLive: true },
        },
        headers: { "x-mock-auth": mock ? "true" : "false" },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.message || "Gateway error");
      setLlmStatus({ label: data.text || data.output || "OK", tone: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "LLM test failed";
      setLlmStatus({ label: "LLM test failed", tone: "error", detail: message });
    }
  };

  const runNotifyTest = async () => {
    setNotifyStatus({ label: "Running...", tone: "warn" });
    try {
      const { data, error } = await supabase.functions.invoke("notify-gateway", {
        body: {
          channel: "sms",
          to: notifyPhone || "+10000000000",
          subject: "Test",
          body: notifyMessage,
          email: notifyEmail || undefined,
          meta: { allowLive: true },
        },
        headers: { "x-mock-auth": mock ? "true" : "false" },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error?.message || "Notify error");
      setNotifyStatus({ label: data.status || data.provider || "queued (mock)", tone: "ok", detail: JSON.stringify(data) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Notify test failed";
      setNotifyStatus({ label: "Notify test failed", tone: "error", detail: message });
    }
  };

const renderStatus = (status?: Status | null, testId?: string) => {
  if (!status) {
    return (
      <div className="text-sm text-muted-foreground" data-testid={testId}>
        Not started
      </div>
    );
  }
  const color = status.tone === "ok" ? "text-emerald-600" : status.tone === "warn" ? "text-amber-600" : "text-red-600";
  return (
    <div className={`text-sm ${color}`} data-testid={testId}>
      {status.label}
      {status.detail ? ` – ${status.detail}` : ""}
    </div>
  );
};

  const clientVsServer = envSchema.filter((env) => env.scope === "server");

  return (
    <div className="container py-8 space-y-6" data-testid="setup-home">
      <Helmet>
        <title>Setup Wizard</title>
      </Helmet>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Setup Wizard</h1>
          <p className="text-muted-foreground">Guided steps for envs, gateways, and proof gate.</p>
        </div>
        <Badge>{mock ? "Mock mode" : "Live mode"}</Badge>
      </div>

      <Card data-testid="setup-stepper">
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>5 steps to go from zero to deploy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {steps.map((s, idx) => (
            <Badge key={s} variant="outline">{`${idx + 1}. ${s}`}</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client vs Server Secrets</CardTitle>
          <CardDescription>Never put provider secrets in VITE_*.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded border p-3">
            <div className="font-semibold mb-2">NEVER put these in VITE_*:</div>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              {clientVsServer.map((env) => (
                <li key={env.name}>{env.name}</li>
              ))}
              <li>Webhook secrets (Stripe, etc.)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supabase</CardTitle>
          <CardDescription>Configure project URL + anon key; test connectivity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="SUPABASE_URL" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} />
            <Input placeholder="SUPABASE_ANON_KEY" value={supabaseAnon} onChange={(e) => setSupabaseAnon(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testSupabase} data-testid="setup-supabase-test">
              Test Supabase config
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copy(envLocalTemplate)} data-testid="setup-copy-envlocal">
              Copy .env.local template (mock)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copy(vercelTemplate)} data-testid="setup-copy-vercel">
              Copy Vercel env template (test)
            </Button>
          </div>
          {renderStatus(supabaseStatus, "setup-supabase-status")}
          <p className="text-sm text-muted-foreground">
            Vercel → Project → Settings → Environment Variables → add SUPABASE_URL, SUPABASE_ANON_KEY (server env).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM Gateway</CardTitle>
          <CardDescription>Run smoke prompt through llm-gateway.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runLlmSmoke} data-testid="setup-llm-test">
            Run smoke prompt
          </Button>
          <div data-testid="setup-llm-status">{renderStatus(llmStatus)}</div>
          <p className="text-sm text-muted-foreground">
            Uses provider: Gemini. In mock mode returns deterministic OK. Live mode requires server key or demo key allowed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications Gateway</CardTitle>
          <CardDescription>Send a test SMS/email via notify-gateway.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Test phone (+15551234567)" value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value)} />
            <Input placeholder="Test email (optional)" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
          </div>
          <Textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} />
          <Button onClick={runNotifyTest} data-testid="setup-notify-test">
            Send test
          </Button>
          <div data-testid="setup-notify-status">{renderStatus(notifyStatus)}</div>
          <div className="text-sm text-muted-foreground">
            In mock mode this logs a mock-sent event. If A2P is pending, use email or mock until approved.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stripe Test Mode</CardTitle>
          <CardDescription>Validate key prefixes; copy the required server vars.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="STRIPE_SECRET_KEY (sk_test_*)" />
            <Input placeholder="STRIPE_WEBHOOK_SECRET (whsec_*)" />
            <Input placeholder="STRIPE_PUBLISHABLE_KEY (pk_test_*)" />
          </div>
          <div className="rounded border p-3 text-sm text-muted-foreground space-y-1">
            <div>Server env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET</div>
            <div>Client env (if used): VITE_STRIPE_PUBLISHABLE_KEY</div>
            <div>Warn if using live prefixes in test mode.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

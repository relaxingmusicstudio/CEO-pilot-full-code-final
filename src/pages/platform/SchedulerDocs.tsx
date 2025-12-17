import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldX, Loader2, Github, Cloud, Server, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { useState } from "react";

export default function SchedulerDocs() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const CodeBlock = ({ code, id }: { code: string; id: string }) => (
    <div className="relative">
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={() => copyToClipboard(code, id)}
      >
        {copiedId === id ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  // Admin-only guard
  if (roleLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Alert variant="destructive">
          <ShieldX className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            This page is restricted to platform administrators only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!SUPABASE_URL) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Configuration Missing</AlertTitle>
          <AlertDescription>
            VITE_SUPABASE_URL is not configured. Please check your environment variables.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const githubActionsYaml = `name: Scheduler Trigger
on:
  schedule:
    - cron: '0 6 * * *'     # Daily briefs at 6 AM UTC
    - cron: '0 */6 * * *'   # Cost rollup every 6 hours
    - cron: '*/15 * * * *'  # Outreach queue every 15 minutes
  workflow_dispatch:
    inputs:
      action:
        description: 'Scheduler action to run'
        required: true
        default: 'run_daily_briefs'
        type: choice
        options:
          - run_daily_briefs
          - run_cost_rollup
          - run_outreach_queue

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Determine action
        id: action
        run: |
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "action=\${{ inputs.action }}" >> $GITHUB_OUTPUT
          elif [ "\${{ github.event.schedule }}" = "0 6 * * *" ]; then
            echo "action=run_daily_briefs" >> $GITHUB_OUTPUT
          elif [ "\${{ github.event.schedule }}" = "0 */6 * * *" ]; then
            echo "action=run_cost_rollup" >> $GITHUB_OUTPUT
          else
            echo "action=run_outreach_queue" >> $GITHUB_OUTPUT
          fi

      - name: Trigger Scheduler
        run: |
          curl -X POST "${SUPABASE_URL}/functions/v1/scheduler-webhook" \\
            -H "Content-Type: application/json" \\
            -H "X-Internal-Secret: \${{ secrets.INTERNAL_SCHEDULER_SECRET }}" \\
            -d '{"action": "\${{ steps.action.outputs.action }}"}'`;

  const cloudflareWorker = `// Cloudflare Worker Cron Trigger
// Deploy as a Cloudflare Worker with Cron Triggers

export default {
  async scheduled(event, env, ctx) {
    const actions = {
      '0 6 * * *': 'run_daily_briefs',
      '0 */6 * * *': 'run_cost_rollup',
      '*/15 * * * *': 'run_outreach_queue',
    };
    
    const action = actions[event.cron] || 'run_outreach_queue';
    
    const response = await fetch('${SUPABASE_URL}/functions/v1/scheduler-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_SCHEDULER_SECRET,
      },
      body: JSON.stringify({ action }),
    });
    
    console.log(\`Scheduler \${action}: \${response.status}\`);
  },
};

// wrangler.toml:
// [triggers]
// crons = ["0 6 * * *", "0 */6 * * *", "*/15 * * * *"]`;

  const gcpScheduler = `# Google Cloud Scheduler Setup

# 1. Create a service account with no special permissions

# 2. Create scheduler jobs:

# Daily Briefs (6 AM UTC)
gcloud scheduler jobs create http ceo-daily-briefs \\
  --schedule="0 6 * * *" \\
  --uri="${SUPABASE_URL}/functions/v1/scheduler-webhook" \\
  --http-method=POST \\
  --headers="Content-Type=application/json,X-Internal-Secret=YOUR_SECRET" \\
  --message-body='{"action":"run_daily_briefs"}' \\
  --time-zone="UTC"

# Cost Rollup (every 6 hours)
gcloud scheduler jobs create http ceo-cost-rollup \\
  --schedule="0 */6 * * *" \\
  --uri="${SUPABASE_URL}/functions/v1/scheduler-webhook" \\
  --http-method=POST \\
  --headers="Content-Type=application/json,X-Internal-Secret=YOUR_SECRET" \\
  --message-body='{"action":"run_cost_rollup"}' \\
  --time-zone="UTC"

# Outreach Queue (every 15 minutes)
gcloud scheduler jobs create http ceo-outreach-queue \\
  --schedule="*/15 * * * *" \\
  --uri="${SUPABASE_URL}/functions/v1/scheduler-webhook" \\
  --http-method=POST \\
  --headers="Content-Type=application/json,X-Internal-Secret=YOUR_SECRET" \\
  --message-body='{"action":"run_outreach_queue"}' \\
  --time-zone="UTC"`;

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">External Scheduler Setup</h1>
        <p className="text-muted-foreground mt-1">
          Configure external cron services as a fallback or alternative to pg_cron
        </p>
      </div>

      <Alert>
        <Server className="h-5 w-5" />
        <AlertTitle>Primary: Supabase pg_cron</AlertTitle>
        <AlertDescription>
          The platform uses Supabase pg_cron as the primary scheduler. External services
          are optional and serve as a backup if pg_cron is unavailable.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Endpoint Configuration</CardTitle>
          <CardDescription>
            All external schedulers should call this endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Webhook URL:</p>
            <CodeBlock
              code={`${SUPABASE_URL}/functions/v1/scheduler-webhook`}
              id="webhook-url"
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Required Headers:</p>
            <CodeBlock
              code={`Content-Type: application/json
X-Internal-Secret: <your-internal-scheduler-secret>`}
              id="headers"
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Request Body:</p>
            <CodeBlock
              code={`{
  "action": "run_daily_briefs" | "run_cost_rollup" | "run_outreach_queue",
  "tenant_ids": ["uuid1", "uuid2"] // optional, defaults to all active tenants
}`}
              id="body"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">run_daily_briefs</p>
                <p className="text-sm text-muted-foreground">Generate CEO daily briefings</p>
              </div>
              <Badge variant="outline">0 6 * * * (Daily 6 AM)</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">run_cost_rollup</p>
                <p className="text-sm text-muted-foreground">Aggregate AI costs and check budgets</p>
              </div>
              <Badge variant="outline">0 */6 * * * (Every 6h)</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">run_outreach_queue</p>
                <p className="text-sm text-muted-foreground">Process lead outreach queue</p>
              </div>
              <Badge variant="outline">*/15 * * * * (Every 15m)</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="github">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="github" className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            GitHub Actions
          </TabsTrigger>
          <TabsTrigger value="cloudflare" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Cloudflare Workers
          </TabsTrigger>
          <TabsTrigger value="gcp" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Google Cloud
          </TabsTrigger>
        </TabsList>

        <TabsContent value="github" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                GitHub Actions
              </CardTitle>
              <CardDescription>
                Create .github/workflows/scheduler.yml in your repository
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={githubActionsYaml} id="github" />
              <p className="text-sm text-muted-foreground mt-4">
                Add <code className="bg-muted px-1 rounded">INTERNAL_SCHEDULER_SECRET</code> to your 
                repository secrets (Settings → Secrets and variables → Actions).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cloudflare" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Cloudflare Workers
              </CardTitle>
              <CardDescription>
                Deploy as a Cloudflare Worker with Cron Triggers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={cloudflareWorker} id="cloudflare" />
              <p className="text-sm text-muted-foreground mt-4">
                Set <code className="bg-muted px-1 rounded">INTERNAL_SCHEDULER_SECRET</code> as an 
                environment variable in your Worker settings.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gcp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Google Cloud Scheduler
              </CardTitle>
              <CardDescription>
                Create HTTP scheduler jobs using gcloud CLI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={gcpScheduler} id="gcp" />
              <p className="text-sm text-muted-foreground mt-4">
                Replace <code className="bg-muted px-1 rounded">YOUR_SECRET</code> with your 
                actual INTERNAL_SCHEDULER_SECRET value.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

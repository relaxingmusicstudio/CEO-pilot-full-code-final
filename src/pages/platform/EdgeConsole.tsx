import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, Copy, Terminal, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { EdgeConsoleRun } from "@/lib/supportBundle";

interface Template {
  name: string;
  function: string;
  body: object;
  description: string;
}

const templates: Template[] = [
  {
    name: "lead-normalize preflight",
    function: "lead-normalize",
    body: { mode: "preflight" },
    description: "Run dependency check via lead-normalize",
  },
  {
    name: "lead-normalize sample",
    function: "lead-normalize",
    body: {
      tenant_id: "TENANT_ID",
      lead: {
        email: "test@example.com",
        phone: "5550001234",
        source: "edge_console",
      },
    },
    description: "Normalize a sample lead",
  },
  {
    name: "ceo-scheduler health",
    function: "ceo-scheduler",
    body: { action: "health_check" },
    description: "Check ceo-scheduler health",
  },
];

export default function EdgeConsole() {
  const [selectedFunction, setSelectedFunction] = useState("lead-normalize");
  const [requestBody, setRequestBody] = useState("{}");
  const [internalSecret, setInternalSecret] = useState("");
  const [includeAuth, setIncludeAuth] = useState(true);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<{ status: number; body: unknown; headers: Record<string, string> } | null>(null);
  const [runs, setRuns] = useState<EdgeConsoleRun[]>([]);
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const edgeBaseUrl = `${supabaseUrl}/functions/v1`;

  const loadTemplate = (template: Template) => {
    setSelectedFunction(template.function);
    setRequestBody(JSON.stringify(template.body, null, 2));
  };

  const runRequest = async () => {
    setRunning(true);
    setResponse(null);
    
    const startTime = Date.now();
    
    try {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(requestBody);
      } catch {
        toast.error("Invalid JSON in request body");
        setRunning(false);
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (includeAuth) {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.access_token) {
          headers["Authorization"] = `Bearer ${session.session.access_token}`;
        }
      }

      if (internalSecret) {
        headers["X-Internal-Secret"] = internalSecret;
      }

      const res = await fetch(`${edgeBaseUrl}/${selectedFunction}`, {
        method: "POST",
        headers,
        body: JSON.stringify(parsedBody),
      });

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseBody: unknown;
      try {
        responseBody = await res.json();
      } catch {
        responseBody = await res.text();
      }

      const duration = Date.now() - startTime;

      setResponse({
        status: res.status,
        body: responseBody,
        headers: responseHeaders,
      });

      const run: EdgeConsoleRun = {
        timestamp: new Date().toISOString(),
        function_name: selectedFunction,
        request: {
          method: "POST",
          headers: { ...headers, Authorization: headers.Authorization ? "[REDACTED]" : undefined } as Record<string, string>,
          body: parsedBody,
        },
        response: {
          status: res.status,
          headers: responseHeaders,
          body: responseBody,
        },
        duration_ms: duration,
      };

      setRuns(prev => [run, ...prev.slice(0, 9)]);

      // Try to log to platform_audit_log
      try {
        await supabase.from("platform_audit_log").insert({
          entity_type: "edge_console",
          entity_id: selectedFunction,
          action_type: "edge_function_call",
          description: `Called ${selectedFunction} via Edge Console`,
          success: res.ok,
        });
      } catch {
        // Ignore if audit log insert fails
      }

      toast.success(`Request completed: ${res.status}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setResponse({
        status: 0,
        body: { error: errMsg },
        headers: {},
      });
      toast.error(`Request failed: ${errMsg}`);
    } finally {
      setRunning(false);
    }
  };

  const copyRun = (run: EdgeConsoleRun) => {
    navigator.clipboard.writeText(JSON.stringify(run, null, 2));
    toast.success("Run copied to clipboard");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-6 w-6" />
            Edge Console
          </CardTitle>
          <CardDescription>
            Invoke edge functions with templates and capture evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Templates */}
          <div className="space-y-2">
            <Label>Quick Templates</Label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <Button 
                  key={t.name} 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadTemplate(t)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Function selector */}
          <div className="space-y-2">
            <Label>Function</Label>
            <Select value={selectedFunction} onValueChange={setSelectedFunction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead-normalize">lead-normalize</SelectItem>
                <SelectItem value="ceo-scheduler">ceo-scheduler</SelectItem>
                <SelectItem value="alex-chat">alex-chat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Request body */}
          <div className="space-y-2">
            <Label>Request Body (JSON)</Label>
            <Textarea 
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              className="font-mono text-xs h-32"
              placeholder='{"mode": "preflight"}'
            />
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>X-Internal-Secret (optional)</Label>
              <Input 
                type="password"
                value={internalSecret}
                onChange={(e) => setInternalSecret(e.target.value)}
                placeholder="Leave empty for public calls"
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Switch checked={includeAuth} onCheckedChange={setIncludeAuth} />
              <Label>Include Authorization header</Label>
            </div>
          </div>

          {/* Run button */}
          <Button onClick={runRequest} disabled={running} className="w-full">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Run Request
          </Button>

          {/* Response */}
          {response && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Response</Label>
                <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
                  {response.status >= 200 && response.status < 300 ? 
                    <CheckCircle2 className="h-3 w-3 mr-1" /> : 
                    <XCircle className="h-3 w-3 mr-1" />
                  }
                  {response.status}
                </Badge>
              </div>
              <Textarea 
                value={JSON.stringify(response.body, null, 2)}
                readOnly
                className="font-mono text-xs h-48"
              />
            </div>
          )}

          {/* Recent runs */}
          {runs.length > 0 && (
            <div className="space-y-2">
              <Label>Recent Runs</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {runs.map((run, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={run.response.status >= 200 && run.response.status < 300 ? "default" : "destructive"}>
                        {run.response.status}
                      </Badge>
                      <span>{run.function_name}</span>
                      <span className="text-muted-foreground">{run.duration_ms}ms</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyRun(run)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

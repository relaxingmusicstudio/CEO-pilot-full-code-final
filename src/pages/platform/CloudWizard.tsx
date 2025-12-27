import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, XCircle, Loader2, Copy, Key, ExternalLink, RefreshCw, AlertTriangle, Cloud, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";
import { generateSecretValue, PreflightReport } from "@/lib/supportBundle";

export default function CloudWizard() {
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [secretToValidate, setSecretToValidate] = useState<string>("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<PreflightReport | null>(null);
  const [recheckRunning, setRecheckRunning] = useState(false);
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const edgeBaseUrl = `${supabaseUrl}/functions/v1`;

  const handleGenerateSecret = () => {
    const secret = generateSecretValue();
    setGeneratedSecret(secret);
    setSecretToValidate(secret);
    setSecretCopied(false);
    toast.success("Secret generated! Copy it before leaving this page.");
  };

  const copySecret = () => {
    if (generatedSecret) {
      navigator.clipboard.writeText(generatedSecret);
      setSecretCopied(true);
      toast.success("Secret copied to clipboard");
    }
  };

  const copySecretName = () => {
    navigator.clipboard.writeText("INTERNAL_SCHEDULER_SECRET");
    toast.success("Secret name copied");
  };

  const copySecretValue = () => {
    if (secretToValidate) {
      navigator.clipboard.writeText(secretToValidate);
      toast.success("Secret value copied");
    }
  };

  const validateSchedulerSecret = async () => {
    const secretValue = secretToValidate || generatedSecret;
    if (!secretValue) {
      toast.error("Enter or generate a secret first");
      return;
    }
    
    setValidating(true);
    setValidationResult(null);
    
    try {
      const response = await fetch(`${edgeBaseUrl}/ceo-scheduler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": secretValue,
        },
        body: JSON.stringify({ action: "health_check" }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.ok !== false) {
        setValidationResult({ ok: true, message: "Secret is valid! ceo-scheduler responded successfully." });
      } else {
        setValidationResult({ ok: false, message: `Validation failed: ${data.error || response.status}` });
      }
    } catch (err) {
      setValidationResult({ ok: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setValidating(false);
    }
  };

  const runRecheck = async () => {
    setRecheckRunning(true);
    const runRpc = (fn: string) =>
      supabase.rpc(fn) as unknown as Promise<{ data: PreflightReport | null; error: { message?: string } | null }>;
    
    // Run DB Doctor
    try {
      const { data } = await runRpc("qa_dependency_check");
      setPreflightStatus(data);
    } catch {
      // ignore dependency check errors
    }
    
    // Run Edge Preflight
    try {
      const response = await fetch(`${edgeBaseUrl}/lead-normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preflight" }),
      });
      const data = await response.json();
      setPreflightStatus(prev => ({ ...prev, ...data.report }));
    } catch {
      // ignore preflight fetch errors
    }
    
    setRecheckRunning(false);
    toast.success("Recheck complete");
  };

  const copyLogsFilter = (filter: string) => {
    navigator.clipboard.writeText(filter);
    toast.success("Filter copied");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner preflightStatus={preflightStatus} onRefresh={runRecheck} />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-6 w-6" />
            Cloud Wizard
          </CardTitle>
          <CardDescription>
            Step-by-step checklist for Supabase configuration tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button onClick={runRecheck} disabled={recheckRunning} variant="outline">
            {recheckRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-check Everything
          </Button>

          <Accordion type="single" collapsible className="w-full">
            {/* Secret Generation */}
            <AccordionItem value="secret">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Generate INTERNAL_SCHEDULER_SECRET
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This secret allows ceo-scheduler to authenticate internal calls.
                  </p>
                  
                  <Button onClick={handleGenerateSecret} className="w-full">
                    <Key className="h-4 w-4 mr-2" />
                    Generate New Secret
                  </Button>
                  
                  {generatedSecret && (
                    <div className="space-y-2 mt-4 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Generated Secret:</span>
                        <Badge variant={secretCopied ? "default" : "secondary"}>
                          {secretCopied ? "Copied!" : "Not copied"}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          value={generatedSecret} 
                          readOnly 
                          className="font-mono text-xs"
                        />
                        <Button onClick={copySecret} variant="outline" size="icon">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Secret to Validate (can paste existing) */}
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium">Secret to Validate</span>
                  <p className="text-xs text-muted-foreground">
                    Paste your existing secret from Supabase, or use the generated one above.
                  </p>
                  <div className="flex gap-2">
                    <Input 
                      value={secretToValidate}
                      onChange={(e) => setSecretToValidate(e.target.value)}
                      placeholder="Paste existing secret here..."
                      className="font-mono text-xs"
                      type="password"
                    />
                    <Button onClick={copySecretValue} variant="outline" size="icon" disabled={!secretToValidate}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Alert>
                  <Settings className="h-4 w-4" />
                  <AlertTitle>Where to Add This Secret</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <ol className="list-decimal pl-4 mt-2 space-y-1 text-sm">
                      <li>Open <strong>Supabase Dashboard</strong></li>
                      <li>Go to <strong>Edge Functions</strong> in the sidebar</li>
                      <li>Click <strong>Secrets</strong> tab at the top</li>
                      <li>Click <strong>Add new secret</strong></li>
                      <li>Enter name: <code className="bg-muted px-1 rounded">INTERNAL_SCHEDULER_SECRET</code>
                        <Button variant="ghost" size="sm" onClick={copySecretName} className="ml-2 h-6">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </li>
                      <li>Paste the generated secret value</li>
                      <li>Click <strong>Save</strong></li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button onClick={validateSchedulerSecret} disabled={validating || !secretToValidate} variant="outline">
                    {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Validate Secret
                  </Button>
                </div>

                {validationResult && (
                  <Alert variant={validationResult.ok ? "default" : "destructive"}>
                    {validationResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertTitle>{validationResult.ok ? "Success" : "Failed"}</AlertTitle>
                    <AlertDescription>{validationResult.message}</AlertDescription>
                  </Alert>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* JWT Mode */}
            <AccordionItem value="jwt">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Check Function JWT Mode
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>verify_jwt Setting</AlertTitle>
                  <AlertDescription>
                    <p className="mt-2">
                      By default, Supabase Edge Functions require JWT authentication (<code>verify_jwt = true</code>).
                    </p>
                    <p className="mt-2">
                      For public endpoints like <code>lead-normalize</code>, set <code>verify_jwt = false</code> in:
                    </p>
                    <code className="block mt-2 p-2 bg-muted rounded text-xs">
                      supabase/config.toml
                    </code>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
{`[functions.lead-normalize]
verify_jwt = false

[functions.ceo-scheduler]
verify_jwt = false`}
                    </pre>
                  </AlertDescription>
                </Alert>
              </AccordionContent>
            </AccordionItem>

            {/* Logs */}
            <AccordionItem value="logs">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Logs Quick Links
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Click to copy log filter strings for Supabase Dashboard → Edge Functions → Logs:
                </p>
                <div className="grid gap-2">
                  {[
                    "normalize_failed",
                    "error_code 42704",
                    "error_code 42501",
                    "preflight_rpc_failed",
                    "rate_limited",
                  ].map((filter) => (
                    <Button 
                      key={filter} 
                      variant="outline" 
                      className="justify-start font-mono text-xs"
                      onClick={() => copyLogsFilter(filter)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {filter}
                    </Button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {preflightStatus && (preflightStatus.suspect_count ?? 0) > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Blockers Found</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-2">
                  {preflightStatus.suspects?.map((s, i) => (
                    <li key={i}><code>{s.object}</code> - {s.type}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

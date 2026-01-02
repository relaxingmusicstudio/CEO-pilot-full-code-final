import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "@/components/AdminLayout";
import { AdminBackButton } from "@/components/AdminBackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requiredApprovalsForRisk } from "@/kernel/mandates";

type RiskLevel = "low" | "medium" | "high" | "critical";

type MandateValidation = {
  ok: boolean;
  code: string;
  approvals: {
    required: number;
    provided: number;
    unique: number;
  };
  signatureValid: boolean;
  expired: boolean;
};

type MandateResponse = {
  ok: boolean;
  error?: string;
  errorCode?: string;
  result?: MandateValidation;
};

const riskOptions: RiskLevel[] = ["low", "medium", "high", "critical"];

const parseResponse = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MandateResponse;
  } catch {
    return null;
  }
};

export default function AdminMandates() {
  const [tokenText, setTokenText] = useState("");
  const [expectedIntent, setExpectedIntent] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("high");
  const [result, setResult] = useState<MandateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requiredApprovals = useMemo(() => requiredApprovalsForRisk(riskLevel), [riskLevel]);

  const handleValidate = async () => {
    setError(null);
    setResult(null);
    const trimmed = tokenText.trim();
    if (!trimmed) {
      setError("token_required");
      return;
    }
    let token: unknown;
    try {
      token = JSON.parse(trimmed);
    } catch {
      setError("invalid_json");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/mandate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          expectedIntent: expectedIntent.trim() || undefined,
          minApprovals: requiredApprovals,
          minRiskLevel: riskLevel,
        }),
      });
      const raw = await response.text();
      const parsed = parseResponse(raw);
      if (!parsed) {
        setError("non_json_response");
        return;
      }
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setLoading(false);
    }
  };

  const validation = result?.result;
  const statusLabel = result?.ok ? "valid" : result ? "blocked" : "idle";

  return (
    <>
      <Helmet>
        <title>Mandates | Admin</title>
        <meta name="description" content="Validate governance mandate tokens before execution." />
      </Helmet>
      <AdminLayout title="Mandates" subtitle="Validate external approvals and render friction">
        <div className="mb-4">
          <AdminBackButton to="/admin/ops" label="Back to Ops" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Mandate Input</CardTitle>
              <CardDescription>Paste a mandate token JSON for server-side validation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={tokenText}
                onChange={(event) => setTokenText(event.target.value)}
                placeholder='{"payload":{...},"signature":"...","alg":"HMAC-SHA256"}'
                rows={8}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Expected intent (optional)</div>
                  <Input
                    value={expectedIntent}
                    onChange={(event) => setExpectedIntent(event.target.value)}
                    placeholder="analytics.track_event"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Risk level</div>
                  <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as RiskLevel)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select risk" />
                    </SelectTrigger>
                    <SelectContent>
                      {riskOptions.map((risk) => (
                        <SelectItem key={risk} value={risk}>
                          {risk}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={requiredApprovals > 0 ? "destructive" : "secondary"}>
                  Required approvals: {requiredApprovals}
                </Badge>
                <Button onClick={handleValidate} disabled={loading}>
                  {loading ? "Validating..." : "Validate Mandate"}
                </Button>
              </div>
              {error && <Badge variant="destructive">Error: {error}</Badge>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Friction Renderer</CardTitle>
              <CardDescription>Shows why an action is blocked or approved.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <Badge variant={result?.ok ? "secondary" : result ? "destructive" : "outline"}>{statusLabel}</Badge>
              </div>
              {validation ? (
                <>
                  <div className="flex items-center justify-between">
                    <span>Code</span>
                    <span className="text-muted-foreground">{validation.code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Approvals</span>
                    <span className="text-muted-foreground">
                      {validation.approvals.unique}/{validation.approvals.required}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Signature</span>
                    <span className="text-muted-foreground">
                      {validation.signatureValid ? "valid" : "invalid"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Expired</span>
                    <span className="text-muted-foreground">{validation.expired ? "yes" : "no"}</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">
                  Submit a token to render mandate friction details.
                </div>
              )}
              {result && !result.ok && result.errorCode && (
                <Badge variant="destructive">Error code: {result.errorCode}</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </>
  );
}

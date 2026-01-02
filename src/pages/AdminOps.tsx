import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { AdminBackButton } from "@/components/AdminBackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type KernelStatus = {
  lock?: {
    locked?: boolean;
    mode?: string;
    reason?: string;
  };
  node?: string;
  ts?: string;
  env?: {
    nodeEnv?: string | null;
    vercelEnv?: string | null;
  };
};

const apiList = [
  "/api/build",
  "/api/diag",
  "/api/audit/run",
  "/api/kernel/status",
  "/api/mandate/verify",
];

const fetchJson = async (path: string) => {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const raw = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("non_json_response");
  }
  if (!response.ok || parsed?.ok === false) {
    throw new Error((parsed?.error as string) || `status_${response.status}`);
  }
  return parsed as KernelStatus;
};

export default function AdminOps() {
  const navigate = useNavigate();
  const [kernelStatus, setKernelStatus] = useState<KernelStatus | null>(null);
  const [kernelError, setKernelError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchJson("/api/kernel/status")
      .then((data) => {
        if (!active) return;
        setKernelStatus(data);
        setKernelError(null);
      })
      .catch((error) => {
        if (!active) return;
        setKernelError(error instanceof Error ? error.message : "kernel_status_failed");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <Helmet>
        <title>Ops Interface | Admin</title>
        <meta name="description" content="Ops interface for kernel health and proof checks." />
      </Helmet>
      <AdminLayout title="Ops Interface" subtitle="Read-only ops status and proof hooks">
        <div className="mb-4">
          <AdminBackButton to="/app/ops" label="Back to Ops Hub" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kernel Lock</CardTitle>
              <CardDescription>Runtime status from /api/kernel/status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {kernelError ? (
                <Badge variant="destructive">Error: {kernelError}</Badge>
              ) : kernelStatus ? (
                <>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <Badge variant={kernelStatus.lock?.locked ? "destructive" : "secondary"}>
                      {kernelStatus.lock?.locked ? "Locked" : "Open"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Reason</span>
                    <span className="text-muted-foreground">{kernelStatus.lock?.reason ?? "unknown"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Node</span>
                    <span className="text-muted-foreground">{kernelStatus.node ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Env</span>
                    <span className="text-muted-foreground">
                      {kernelStatus.env?.vercelEnv ?? "n/a"} / {kernelStatus.env?.nodeEnv ?? "n/a"}
                    </span>
                  </div>
                </>
              ) : (
                <Badge variant="outline">Loading…</Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ops Hub</CardTitle>
              <CardDescription>Full checklist and proof gate workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => navigate("/app/ops")}>Open Ops Hub</Button>
              <div className="text-xs text-muted-foreground">
                Use Ops Hub to run proof gate and capture failure output packets.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>API Surfaces</CardTitle>
            <CardDescription>Endpoints expected to return JSON only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {apiList.map((path) => (
              <div key={path} className="flex items-center justify-between rounded border border-muted px-3 py-2">
                <span>{path}</span>
                <Badge variant="outline">JSON only</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </AdminLayout>
    </>
  );
}

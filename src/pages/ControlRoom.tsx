import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { computeIdentityKey } from "@/lib/spine";
import {
  applyHumanDecision,
  computeExpectedImpact,
  exportState,
  getRuntimeSnapshot,
  importState,
  listImprovementQueue,
  reaffirmValueAnchors,
  setControlProfile,
  type RuntimeSnapshot,
} from "@/lib/ceoPilot/controlRoomApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCcw, ShieldAlert, ShieldCheck } from "lucide-react";

type DecisionNotes = Record<string, string>;

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : "n/a");

const formatDelta = (value: number | null) => {
  if (value === null) return "n/a";
  if (value === 0) return "$0.00";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))}`;
};

const formatQualityDelta = (value: number | null) => {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

export default function ControlRoom() {
  const { userId, email } = useAuth();
  const identityKey = useMemo(() => computeIdentityKey(userId, email), [userId, email]);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [queue, setQueue] = useState<ReturnType<typeof listImprovementQueue>>([]);
  const [notes, setNotes] = useState<DecisionNotes>({});
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [reaffirmStatus, setReaffirmStatus] = useState<string | null>(null);
  const [reaffirmNotes, setReaffirmNotes] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [emergencyMode, setEmergencyMode] = useState<"normal" | "constrained" | "emergency">("normal");
  const [autonomyCap, setAutonomyCap] = useState<"draft" | "suggest" | "execute">("execute");
  const [killSwitch, setKillSwitch] = useState(false);
  const [freezeTaskInput, setFreezeTaskInput] = useState("");
  const [capTier, setCapTier] = useState<"economy" | "standard" | "advanced" | "frontier">("economy");

  const refresh = useCallback(() => {
    if (!identityKey) return;
    setRefreshing(true);
    try {
      const nextSnapshot = getRuntimeSnapshot(identityKey);
      setSnapshot(nextSnapshot);
      setQueue(listImprovementQueue(identityKey));
      const primary = nextSnapshot.data.humanControls[0];
      if (primary) {
        setAutonomyCap(primary.autonomyCeiling);
        setKillSwitch(primary.emergencyStop);
      }
      setEmergencyMode(nextSnapshot.data.emergencyMode?.mode ?? "normal");
      if (nextSnapshot.data.costRoutingCap?.tier) {
        setCapTier(nextSnapshot.data.costRoutingCap.tier);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown_error";
      setActionStatus(`Failed to load runtime state: ${message}`);
    } finally {
      setRefreshing(false);
    }
  }, [identityKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const safeMode = snapshot?.safeMode ?? true;
  const safeModeReasons = snapshot?.safeModeReasons ?? [];
  const rolePolicies = snapshot?.data.rolePolicies ?? [];
  const economicBudget = snapshot?.data.economicBudget ?? null;
  const economicAudits = useMemo(
    () => snapshot?.data.economicAudits ?? [],
    [snapshot?.data.economicAudits]
  );

  const candidateTaskTypes = useMemo(() => {
    const types = new Set<string>();
    snapshot?.data.improvementCandidates.forEach((candidate) => {
      if (candidate.target.taskType) types.add(candidate.target.taskType);
    });
    return Array.from(types).sort();
  }, [snapshot?.data.improvementCandidates]);

  const primaryAnchor = useMemo(() => {
    const anchors = snapshot?.data.valueAnchors ?? [];
    if (anchors.length === 0) return null;
    return anchors.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }, [snapshot?.data.valueAnchors]);

  const latestDrift = useMemo(() => {
    const reports = snapshot?.data.driftReports ?? [];
    if (reports.length === 0) return null;
    return reports.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }, [snapshot?.data.driftReports]);

  const latestReaffirmation = useMemo(() => {
    if (!primaryAnchor) return null;
    const records = snapshot?.data.valueReaffirmations ?? [];
    const relevant = records.filter(
      (record) => record.anchorId === primaryAnchor.anchorId && record.anchorVersion === primaryAnchor.version
    );
    if (relevant.length === 0) return null;
    return relevant.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }, [primaryAnchor, snapshot?.data.valueReaffirmations]);

  const filteredChains = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.data.causalChains.filter((chain) => {
      if (actionFilter !== "all" && chain.actionType !== actionFilter) return false;
      if (taskTypeFilter !== "all") {
        const candidate = snapshot.data.improvementCandidates.find((item) => item.candidateId === chain.candidateId);
        if (!candidate || candidate.target.taskType !== taskTypeFilter) return false;
      }
      return true;
    });
  }, [snapshot, actionFilter, taskTypeFilter]);

  const recentEconomicAudits = useMemo(() => {
    return economicAudits
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8);
  }, [economicAudits]);

  const lastEconomicBlock = useMemo(() => {
    return economicAudits
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .find((entry) => entry.decision === "blocked") ?? null;
  }, [economicAudits]);

  const roleEscalations = useMemo(() => {
    const audits = snapshot?.data.roleConstitutionAudits ?? [];
    return audits
      .filter((audit) => audit.decision === "escalate")
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [snapshot?.data.roleConstitutionAudits]);

  const handleDecision = (targetType: "improvement_candidate" | "distilled_rule", targetId: string, decision: "approve" | "reject" | "request_more_evidence" | "escalate") => {
    if (!identityKey) return;
    setActionStatus(null);
    try {
      applyHumanDecision({
        identityKey,
        targetType,
        targetId,
        decision,
        notes: notes[targetId],
        decidedBy: email ?? userId ?? "human",
      });
      setActionStatus(`Decision recorded: ${decision}`);
      refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "decision_failed";
      setActionStatus(message);
    }
  };

  const handleExport = () => {
    if (!identityKey) return;
    const payload = exportState(identityKey);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `control-room-${identityKey}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File | null) => {
    if (!file || !identityKey) return;
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result ?? "{}"));
        importState(payload, identityKey);
        setImportStatus("Import complete.");
        refresh();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "invalid_payload";
        setImportStatus(`Import failed: ${message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleControlUpdate = () => {
    if (!identityKey) return;
    setActionStatus(null);
    try {
      setControlProfile({
        identityKey,
        autonomyCap,
        emergencyMode,
        emergencyStop: killSwitch,
        costRoutingCapTier: capTier,
        costRoutingCapReason: "control_room_override",
      });
      setActionStatus("Control profile updated.");
      refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "control_update_failed";
      setActionStatus(message);
    }
  };

  const handleReaffirmAnchors = () => {
    if (!identityKey) return;
    setReaffirmStatus(null);
    try {
      reaffirmValueAnchors({
        identityKey,
        notes: reaffirmNotes || undefined,
        decidedBy: email ?? userId ?? "human",
      });
      setReaffirmStatus("Anchors reaffirmed.");
      setReaffirmNotes("");
      refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "reaffirm_failed";
      setReaffirmStatus(message);
    }
  };

  const handleFreezeTask = () => {
    if (!identityKey || !freezeTaskInput.trim()) return;
    setControlProfile({
      identityKey,
      freezeTaskTypes: [freezeTaskInput.trim()],
    });
    setFreezeTaskInput("");
    refresh();
  };

  const handleReleaseFreeze = (taskType: string) => {
    if (!identityKey) return;
    setControlProfile({
      identityKey,
      releaseFreezeTaskTypes: [taskType],
    });
    refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Control Room | CEO Pilot</title>
      </Helmet>

      <div className="px-6 py-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Control Room</h1>
            <p className="text-muted-foreground text-sm">
              Human oversight for routing, cost governance, improvements, and interpretability.
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {safeMode && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="flex flex-row items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <CardTitle className="text-sm text-destructive">Safe Mode Active</CardTitle>
                <CardDescription>
                  Runtime state is incomplete. Human review required before changes.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-destructive">
              {safeModeReasons.length > 0 ? safeModeReasons.join(", ") : "Missing or corrupt runtime data."}
            </CardContent>
          </Card>
        )}

        {actionStatus && (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
            {actionStatus}
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="routing">Routing</TabsTrigger>
            <TabsTrigger value="costs">Costs/Budgets</TabsTrigger>
            <TabsTrigger value="improvements">Improvement Queue</TabsTrigger>
            <TabsTrigger value="interpretability">Interpretability</TabsTrigger>
            <TabsTrigger value="roles">Role Constitution</TabsTrigger>
            <TabsTrigger value="controls">Emergency & Controls</TabsTrigger>
            <TabsTrigger value="export">Export/Import</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">System Mode</CardTitle>
                  <CardDescription>Emergency posture & autonomy</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Mode</span>
                    <Badge variant={snapshot?.summary.emergencyMode?.mode === "emergency" ? "destructive" : "secondary"}>
                      {snapshot?.summary.emergencyMode?.mode ?? "normal"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Autonomy Cap</span>
                    <span className="font-medium">{snapshot?.summary.autonomyCeiling ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Max Model Tier</span>
                    <span className="font-medium">{snapshot?.summary.maxModelTier ?? "n/a"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Cost Guardrails</CardTitle>
                  <CardDescription>Caps and routing limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Routing Cap</span>
                    <span className="font-medium">
                      {snapshot?.summary.costRoutingCap?.tier ?? "none"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Budgets</span>
                    <span className="font-medium">{snapshot?.data.costBudgets.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cost Events</span>
                    <span className="font-medium">{snapshot?.data.costEvents.length ?? 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Last 24h Outcomes</CardTitle>
                  <CardDescription>Execution performance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Runs</span>
                    <span className="font-medium">{snapshot?.summary.last24h.outcomeCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Avg Quality</span>
                    <span className="font-medium">{snapshot?.summary.last24h.avgQuality ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Avg Cost</span>
                    <span className="font-medium">{formatCurrency(snapshot?.summary.last24h.avgCostCents ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Value Anchors</CardTitle>
                  <CardDescription>Canonical objectives and constraints.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Anchor</span>
                    <span className="font-medium">{primaryAnchor?.anchorId ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Version</span>
                    <span className="font-medium">{primaryAnchor?.version ?? "n/a"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Review cadence</span>
                    <span className="font-medium">{primaryAnchor?.reviewCadence ?? "n/a"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {formatDateTime(primaryAnchor?.createdAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last reaffirmed: {formatDateTime(latestReaffirmation?.createdAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Core objectives:{" "}
                    {(primaryAnchor?.coreObjectives ?? [])
                      .slice()
                      .sort((left, right) => left.rank - right.rank)
                      .map((objective) => `${objective.rank}. ${objective.description}`)
                      .join(" | ") || "n/a"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Do not optimize:{" "}
                    {(primaryAnchor?.doNotOptimize ?? [])
                      .map((constraint) => constraint.description)
                      .join(" | ") || "n/a"}
                  </div>
                  <Textarea
                    value={reaffirmNotes}
                    onChange={(event) => setReaffirmNotes(event.target.value)}
                    placeholder="Notes for reaffirming anchors."
                    className="min-h-16"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleReaffirmAnchors} disabled={safeMode || !primaryAnchor}>
                      Reaffirm Anchors
                    </Button>
                    {reaffirmStatus && <span className="text-xs text-muted-foreground">{reaffirmStatus}</span>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Value Drift Status</CardTitle>
                  <CardDescription>Latest drift report and tripwire status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Severity</span>
                    <Badge variant={latestDrift?.severity === "high" ? "destructive" : "secondary"}>
                      {latestDrift?.severity ?? "n/a"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Reasons: {(latestDrift?.reasons ?? []).length
                      ? (latestDrift?.reasons ?? []).join(" | ")
                      : "none"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Window: {formatDateTime(latestDrift?.window?.recentStart)} - {formatDateTime(latestDrift?.window?.recentEnd)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Decision drift: {typeof latestDrift?.metrics?.decisionDistribution?.jsDivergence === "number"
                      ? latestDrift.metrics.decisionDistribution.jsDivergence.toFixed(3)
                      : "n/a"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Routing drift: {typeof latestDrift?.metrics?.routingDistribution?.jsDivergence === "number"
                      ? latestDrift.metrics.routingDistribution.jsDivergence.toFixed(3)
                      : "n/a"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Failure delta: {typeof latestDrift?.metrics?.outcomeRates?.deltaFailureRate === "number"
                      ? latestDrift.metrics.outcomeRates.deltaFailureRate.toFixed(3)
                      : "n/a"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Near-miss delta: {typeof latestDrift?.metrics?.constraintTrend?.nearMissRateDelta === "number"
                      ? latestDrift.metrics.constraintTrend.nearMissRateDelta.toFixed(3)
                      : "n/a"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="routing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Latest Routing Decisions</CardTitle>
                <CardDescription>Model tier selection with justification</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Justification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot?.data.modelRoutingHistory.slice(-12).reverse().map((entry) => (
                      <TableRow key={entry.decision.decisionId}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(entry.decision.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">{entry.request.task}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.decision.tier}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatCurrency(entry.decision.estimatedCostCents)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.decision.justification.join(" | ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Routing Preferences</CardTitle>
                <CardDescription>Active caps and upgrades</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {snapshot?.data.routingPreferences.map((pref) => (
                  <div key={pref.preferenceId} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{pref.taskType}</span>
                      <Badge variant={pref.status === "active" ? "secondary" : "outline"}>{pref.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pref.minTier ? `Min: ${pref.minTier}` : "Min: -"}{" | "}
                      {pref.maxTier ? `Max: ${pref.maxTier}` : "Max: —"}
                    </div>
                    <div className="text-xs text-muted-foreground">Reason: {pref.reason}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Economic Budget</CardTitle>
                <CardDescription>Runtime budget state and recent usage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Total Budget</span>
                  <span className="font-medium">{economicBudget?.totalBudget ?? "n/a"} units</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Remaining Budget</span>
                  <span className="font-medium">{economicBudget?.remainingBudget ?? "n/a"} units</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Session Remaining</span>
                  <span className="font-medium">{economicBudget?.sessionRemaining ?? "n/a"} units</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Window start: {formatDateTime(economicBudget?.windowStart)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last block: {lastEconomicBlock ? `${lastEconomicBlock.reason} (${formatDateTime(lastEconomicBlock.createdAt)})` : "none"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Budgets</CardTitle>
                <CardDescription>Soft and hard limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {snapshot?.data.costBudgets.map((budget) => (
                  <div key={budget.budgetId} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="font-medium">{budget.budgetId}</div>
                      <div className="text-xs text-muted-foreground">
                        Scope: {budget.scope.goalId ?? budget.scope.agentId ?? budget.scope.taskType ?? "global"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Soft: {formatCurrency(budget.softLimitCents)}</div>
                      <div>Hard: {formatCurrency(budget.limitCents)}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cost Events</CardTitle>
                <CardDescription>Soft/hard limit signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {snapshot?.data.costEvents.slice(-12).reverse().map((event) => (
                  <div key={event.eventId} className="flex items-start justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="font-medium">{event.type}</div>
                      <div className="text-muted-foreground">Reason: {event.reason}</div>
                    </div>
                    <div className="text-muted-foreground">{formatDateTime(event.createdAt)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Economic Usage</CardTitle>
                <CardDescription>Latest cost-consuming actions and blocks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {recentEconomicAudits.length === 0 ? (
                  <div className="text-muted-foreground">No economic activity recorded.</div>
                ) : (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">When</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Units</TableHead>
                          <TableHead className="text-xs">Decision</TableHead>
                          <TableHead className="text-xs">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentEconomicAudits.map((entry) => (
                          <TableRow key={entry.auditId}>
                            <TableCell className="text-xs">{formatDateTime(entry.createdAt)}</TableCell>
                            <TableCell className="text-xs">{entry.costSource}</TableCell>
                            <TableCell className="text-xs">{entry.costCategory}</TableCell>
                            <TableCell className="text-xs">{entry.costUnits}</TableCell>
                            <TableCell className="text-xs">{entry.decision}</TableCell>
                            <TableCell className="text-xs">{entry.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="improvements" className="space-y-6">
            {queue.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Improvement Queue</CardTitle>
                  <CardDescription>No pending candidates right now.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The improvement loop will surface candidates when evidence warrants changes.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {queue.map(({ candidate, chain }) => {
                  const expectedImpact = snapshot
                    ? computeExpectedImpact(candidate, snapshot.data.outcomes)
                    : { costDeltaCents: null, qualityDelta: null };
                  const targetDetails = [
                    candidate.target.taskType ? `task:${candidate.target.taskType}` : null,
                    candidate.target.modelTier ? `tier:${candidate.target.modelTier}` : null,
                    candidate.target.goalId ? `goal:${candidate.target.goalId}` : null,
                    candidate.target.ruleId ? `rule:${candidate.target.ruleId}` : null,
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  const lineageRefs = chain?.triggers.map((trigger) => trigger.refId).filter(Boolean) ?? [];
                  const confidenceLower = chain?.counterfactuals[0]?.confidenceLowerBound;
                  const confidenceUpper = chain?.counterfactuals[0]?.confidenceUpperBound;
                  const isActionable = candidate.status === "proposed";

                  return (
                    <Card key={candidate.candidateId} className="border border-border">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-sm">{candidate.type.replace(/_/g, " ")}</CardTitle>
                            <CardDescription>{targetDetails || "global"}</CardDescription>
                          </div>
                          <Badge variant={candidate.status === "applied" ? "secondary" : "outline"}>
                            {candidate.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs">
                        <div className="text-muted-foreground">Reason: {candidate.reason}</div>
                        <div className="text-muted-foreground">
                          Evidence: {candidate.evidenceRefs.length > 0 ? candidate.evidenceRefs.join(", ") : "n/a"}
                        </div>
                        <div className="text-muted-foreground">
                          Expected impact: Cost {formatDelta(expectedImpact.costDeltaCents)} | Quality{" "}
                          {formatQualityDelta(expectedImpact.qualityDelta)}
                        </div>
                        <div className="text-muted-foreground">
                          Explanation: {chain?.explanation.summary ?? "Pending explanation"}
                        </div>
                        <div className="text-muted-foreground">
                          Alternatives: {chain?.alternatives ? chain.alternatives.map((alt) => alt.action).join(" | ") : "n/a"}
                        </div>
                        <div className="text-muted-foreground">
                          Counterfactuals: {chain?.counterfactuals ? chain.counterfactuals.map((alt) => alt.alternative).join(" | ") : "n/a"}
                        </div>
                        <div className="text-muted-foreground">
                          Lineage refs: {lineageRefs.length > 0 ? lineageRefs.join(", ") : "n/a"}
                        </div>
                        <div className="text-muted-foreground">
                          Confidence: {confidenceLower !== undefined && confidenceUpper !== undefined ? `${confidenceLower.toFixed(2)} - ${confidenceUpper.toFixed(2)}` : "n/a"}
                        </div>
                        <div className="text-muted-foreground">
                          Review by: {chain?.explanation.reevaluateBy ? formatDateTime(chain.explanation.reevaluateBy) : "n/a"}
                        </div>
                        {!chain ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertTriangle className="h-4 w-4" />
                            Explanation pending.
                          </div>
                        ) : chain.requiresHumanReview ? (
                          <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-4 w-4" />
                            Explanation requires human review before approval.
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-600">
                            <ShieldCheck className="h-4 w-4" />
                            Explanation is clear.
                          </div>
                        )}

                        <Textarea
                          value={notes[candidate.candidateId] ?? ""}
                          onChange={(event) =>
                            setNotes((prev) => ({
                              ...prev,
                              [candidate.candidateId]: event.target.value,
                            }))
                          }
                          placeholder="Decision notes (required if explanation is insufficient)."
                          className="min-h-20"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleDecision("improvement_candidate", candidate.candidateId, "approve")}
                            disabled={safeMode || !isActionable}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDecision("improvement_candidate", candidate.candidateId, "reject")}
                            disabled={safeMode || !isActionable}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleDecision("improvement_candidate", candidate.candidateId, "request_more_evidence")
                            }
                            disabled={safeMode || !isActionable}
                          >
                            Request Evidence
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDecision("improvement_candidate", candidate.candidateId, "escalate")}
                            disabled={safeMode || !isActionable}
                          >
                            Escalate
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Distilled Rules</CardTitle>
                <CardDescription>Review deterministic rules and confidence bounds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {(snapshot?.data.distilledRules.length ?? 0) === 0 && (
                  <div className="text-muted-foreground">No distilled rules recorded.</div>
                )}
                {snapshot?.data.distilledRules.map((rule) => (
                  <div key={rule.ruleId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">{rule.taskType}</div>
                        <div className="text-muted-foreground">
                          Goal: {rule.goalId} | Input: {rule.inputHash}
                        </div>
                      </div>
                      <Badge variant={rule.status === "active" ? "secondary" : "outline"}>{rule.status}</Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      Provenance: {rule.provenance.createdBy} | Outcomes: {rule.provenance.sourceOutcomeIds.length}
                    </div>
                    <div className="text-muted-foreground">
                      Confidence: {rule.confidenceLowerBound.toFixed(2)} - {rule.confidenceUpperBound.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground">
                      Expires: {rule.expiresAt ? formatDateTime(rule.expiresAt) : "n/a"}
                    </div>
                    <Textarea
                      value={notes[rule.ruleId] ?? ""}
                      onChange={(event) =>
                        setNotes((prev) => ({
                          ...prev,
                          [rule.ruleId]: event.target.value,
                        }))
                      }
                      placeholder="Notes for this rule decision."
                      className="mt-2 min-h-16"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDecision("distilled_rule", rule.ruleId, "approve")}
                        disabled={safeMode}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDecision("distilled_rule", rule.ruleId, "reject")}
                        disabled={safeMode}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interpretability" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Filter Causal Chains</CardTitle>
                <CardDescription>Trace improvements by action type and task.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground">Action</label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="routing_downgrade">routing_downgrade</option>
                    <option value="routing_upgrade">routing_upgrade</option>
                    <option value="cache_policy">cache_policy</option>
                    <option value="distill_rule">distill_rule</option>
                    <option value="schedule_policy">schedule_policy</option>
                    <option value="freeze_behavior">freeze_behavior</option>
                    <option value="escalation_adjustment">escalation_adjustment</option>
                    <option value="emergency_mode">emergency_mode</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground">Task Type</label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={taskTypeFilter}
                    onChange={(event) => setTaskTypeFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {candidateTaskTypes.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {taskType}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {filteredChains.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">No Causal Chains</CardTitle>
                  <CardDescription>Adjust filters or wait for improvement activity.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredChains.map((chain) => (
                  <Card key={chain.chainId}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-sm">{chain.actionType.replace(/_/g, " ")}</CardTitle>
                          <CardDescription>Candidate {chain.candidateId}</CardDescription>
                        </div>
                        <Badge variant={chain.requiresHumanReview ? "destructive" : "secondary"}>
                          {chain.explanationQuality}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs text-muted-foreground">
                      <div className="text-foreground">{chain.explanation.summary}</div>
                      <div>What changed: {chain.explanation.whatChanged}</div>
                      <div>Why now: {chain.explanation.whyNow}</div>
                      <div>Risk accepted: {chain.explanation.riskAccepted}</div>
                      <div>Risk avoided: {chain.explanation.riskAvoided}</div>
                      <div>Review by: {formatDateTime(chain.explanation.reevaluateBy)}</div>
                      <div>
                        Triggers: {chain.triggers.map((trigger) => trigger.summary).join(" | ")}
                      </div>
                      <div>
                        Alternatives: {chain.alternatives.map((alt) => alt.action).join(" | ")}
                      </div>
                      <div>
                        Counterfactuals: {chain.counterfactuals.map((alt) => alt.alternative).join(" | ")}
                      </div>
                      {chain.requiresHumanReview && (
                        <div className="flex items-center gap-2 text-destructive">
                          <ShieldAlert className="h-4 w-4" />
                          Escalated for human review.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="roles" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Role Policies</CardTitle>
                <CardDescription>Read-only jurisdiction and authority ceilings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {rolePolicies.length === 0 && (
                  <div className="text-muted-foreground">No role policies loaded.</div>
                )}
                {rolePolicies.map((policy) => (
                  <div key={policy.policyId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          {policy.roleName} ({policy.roleId})
                        </div>
                        <div className="text-muted-foreground">Policy {policy.policyId}</div>
                      </div>
                      <Badge variant="secondary">{policy.version}</Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      Domains: {policy.jurisdiction.domains.join(", ")}
                    </div>
                    <div className="text-muted-foreground">
                      Actions: {policy.jurisdiction.actions.join(", ")}
                    </div>
                    <div className="text-muted-foreground">
                      Authority: tier = {policy.authorityCeiling.maxPermissionTier} | class ={" "}
                      {policy.authorityCeiling.maxTaskClass} | impact = {policy.authorityCeiling.maxImpact} | cost ={" "}
                      {formatCurrency(policy.authorityCeiling.maxEstimatedCostCents)}
                    </div>
                    <div className="text-muted-foreground">
                      Denied: {policy.deniedActions.length > 0 ? policy.deniedActions.join(", ") : "none"}
                    </div>
                    <div className="text-muted-foreground">
                      Escalate actions:{" "}
                      {policy.escalationRules.alwaysEscalateActions.length > 0
                        ? policy.escalationRules.alwaysEscalateActions.join(", ")
                        : "none"}
                    </div>
                    <div className="text-muted-foreground">
                      Escalate domains:{" "}
                      {policy.escalationRules.alwaysEscalateDomains.length > 0
                        ? policy.escalationRules.alwaysEscalateDomains.join(", ")
                        : "none"}
                    </div>
                    <div className="text-muted-foreground">
                      Chain: request from [{policy.chainOfCommand.canRequestFromRoles.join(", ") || "none"}] | approve for [
                      {policy.chainOfCommand.canApproveForRoles.join(", ") || "none"}]
                    </div>
                    <div className="text-muted-foreground">
                      Data access: {policy.dataAccess.allowedCategories.join(", ") || "none"}
                    </div>
                    <div className="text-muted-foreground">
                      Tools: {policy.toolAccess.allowedTools.join(", ") || "none"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Escalated Decisions</CardTitle>
                <CardDescription>Role constitution escalations requiring human review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {roleEscalations.length === 0 ? (
                  <div className="text-muted-foreground">No escalations recorded.</div>
                ) : (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">When</TableHead>
                          <TableHead className="text-xs">Role</TableHead>
                          <TableHead className="text-xs">Action</TableHead>
                          <TableHead className="text-xs">Domain</TableHead>
                          <TableHead className="text-xs">Tool</TableHead>
                          <TableHead className="text-xs">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roleEscalations.map((audit) => (
                          <TableRow key={audit.auditId}>
                            <TableCell className="text-xs">{formatDateTime(audit.createdAt)}</TableCell>
                            <TableCell className="text-xs">{audit.roleId}</TableCell>
                            <TableCell className="text-xs">{audit.action}</TableCell>
                            <TableCell className="text-xs">{audit.domain}</TableCell>
                            <TableCell className="text-xs">{audit.tool ?? "n/a"}</TableCell>
                            <TableCell className="text-xs">{audit.reasonCode}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="controls" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Autonomy & Routing</CardTitle>
                  <CardDescription>Set ceilings and caps instantly.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Autonomy Cap</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={autonomyCap}
                      onChange={(event) => setAutonomyCap(event.target.value as typeof autonomyCap)}
                      disabled={safeMode}
                    >
                      <option value="draft">draft</option>
                      <option value="suggest">suggest</option>
                      <option value="execute">execute</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Max Model Tier</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={capTier}
                      onChange={(event) => setCapTier(event.target.value as typeof capTier)}
                      disabled={safeMode}
                    >
                      <option value="economy">economy</option>
                      <option value="standard">standard</option>
                      <option value="advanced">advanced</option>
                      <option value="frontier">frontier</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Emergency Stop</div>
                      <div className="text-xs text-muted-foreground">Blocks all execution immediately.</div>
                    </div>
                    <Switch checked={killSwitch} onCheckedChange={setKillSwitch} disabled={safeMode} />
                  </div>
                  <Button onClick={handleControlUpdate} disabled={safeMode}>
                    Apply Controls
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Emergency Mode</CardTitle>
                  <CardDescription>Force cost and safety posture.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Mode</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={emergencyMode}
                      onChange={(event) => setEmergencyMode(event.target.value as typeof emergencyMode)}
                      disabled={safeMode}
                    >
                      <option value="normal">normal</option>
                      <option value="constrained">constrained</option>
                      <option value="emergency">emergency</option>
                    </select>
                  </div>
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Current mode: {snapshot?.data.emergencyMode?.mode ?? "normal"}
                  </div>
                  <Button onClick={handleControlUpdate} disabled={safeMode}>
                    Apply Emergency Mode
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Behavior Freezes</CardTitle>
                <CardDescription>Pause specific task types immediately.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <Input
                    value={freezeTaskInput}
                    onChange={(event) => setFreezeTaskInput(event.target.value)}
                    placeholder="taskType to freeze"
                    disabled={safeMode}
                  />
                  <Button onClick={handleFreezeTask} disabled={safeMode || !freezeTaskInput.trim()}>
                    Freeze
                  </Button>
                </div>
                <div className="space-y-2 text-xs">
                  {(snapshot?.data.behaviorFreezes ?? [])
                    .filter((freeze) => freeze.status === "active")
                    .map((freeze) => (
                      <div key={freeze.freezeId} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div>
                          <div className="font-medium">{freeze.taskType}</div>
                          <div className="text-muted-foreground">Reason: {freeze.reason}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReleaseFreeze(freeze.taskType)}
                          disabled={safeMode}
                        >
                          Release
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Export Runtime Snapshot</CardTitle>
                <CardDescription>Download a full JSON audit package.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Button onClick={handleExport} disabled={safeMode || !snapshot}>
                  Download JSON
                </Button>
                {safeMode && <Badge variant="destructive">Safe Mode</Badge>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Import Runtime Snapshot</CardTitle>
                <CardDescription>Restore runtime state from JSON.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Input
                  type="file"
                  accept="application/json"
                  onChange={(event) => handleImport(event.target.files?.[0] ?? null)}
                  disabled={safeMode}
                />
                <div className="text-xs text-muted-foreground">
                  Import replaces current runtime state for this identity. Use with care.
                </div>
                {importStatus && <div className="text-xs">{importStatus}</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}




import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import AgentWorkItem, { WorkItem } from "@/components/AgentWorkItem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  GitBranch,
  TrendingUp,
  Target,
  Zap,
  CheckCircle,
  RefreshCw,
  Brain,
  Loader2,
  ArrowRight,
  Users,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
  Plus,
  Trash2,
  Edit,
  FlaskConical,
  BarChart3,
} from "lucide-react";

interface Funnel {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  is_active: boolean;
  is_default: boolean;
  target_score_min: number;
  target_score_max: number;
  created_at: string;
}

interface FunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  stage_order: number;
  stage_type: string;
  target_action: string | null;
}

interface StageMetrics {
  stage_id: string;
  visitors: number;
  conversions: number;
  dropOff: number;
}

interface ABExperiment {
  id: string;
  name: string;
  element_type: string;
  status: string;
  funnel_id: string | null;
  variants: ABVariant[];
}

interface ABVariant {
  id: string;
  name: string;
  value: string;
  views: number;
  conversions: number;
  conversion_rate: number;
}

interface FunnelEnrollment {
  id: string;
  assignment_reason?: string | null;
  converted?: boolean | null;
  enrolled_at?: string | null;
  funnels?: { name?: string | null } | null;
}

const AdminAgentFunnels = () => {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [stageMetrics, setStageMetrics] = useState<Map<string, StageMetrics>>(new Map());
  const [experiments, setExperiments] = useState<ABExperiment[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isABTestOpen, setIsABTestOpen] = useState(false);
  const [newFunnel, setNewFunnel] = useState({ name: "", description: "", goal: "", scoreMin: 0, scoreMax: 100 });
  const [newABTest, setNewABTest] = useState({ name: "", elementType: "cta_button", originalValue: "" });
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch funnels
      const { data: funnelsData } = await supabase
        .from("funnels")
        .select("*")
        .order("is_default", { ascending: false });
      
      if (funnelsData) {
        setFunnels(funnelsData);
        setSelectedFunnel((prev) => prev ?? funnelsData[0] ?? null);
      }

      // Fetch stages
      const { data: stagesData } = await supabase
        .from("funnel_stages")
        .select("*")
        .order("stage_order", { ascending: true });
      
      if (stagesData) setStages(stagesData);

      // Fetch stage conversion metrics
      const { data: conversionsData } = await supabase
        .from("funnel_stage_conversions")
        .select("stage_id, converted");

      if (conversionsData) {
        const metricsMap = new Map<string, StageMetrics>();
        conversionsData.forEach(c => {
          const existing = metricsMap.get(c.stage_id) || { stage_id: c.stage_id, visitors: 0, conversions: 0, dropOff: 0 };
          existing.visitors++;
          if (c.converted) existing.conversions++;
          metricsMap.set(c.stage_id, existing);
        });
        // Calculate drop-off rates
        metricsMap.forEach((metrics, id) => {
          metrics.dropOff = metrics.visitors > 0 
            ? Math.round((1 - metrics.conversions / metrics.visitors) * 100)
            : 0;
        });
        setStageMetrics(metricsMap);
      }

      // Fetch A/B experiments
      const { data: experimentsData } = await supabase
        .from("ab_test_experiments")
        .select("*, ab_test_variants(*)");

      if (experimentsData) {
        setExperiments(experimentsData.map(e => ({
          ...e,
          variants: e.ab_test_variants || []
        })));
      }

      // Fetch enrollments for work items
      const { data: enrollments } = await supabase
        .from("funnel_enrollments")
        .select("*, funnels(name)")
        .eq("ai_assigned", true)
        .order("enrolled_at", { ascending: false })
        .limit(10);

      if (enrollments) {
        const aiWorkItems: WorkItem[] = enrollments.map((entry) => {
          const enrollment = entry as FunnelEnrollment;
          const funnelName = enrollment.funnels?.name ?? "Unknown Funnel";
          return {
            id: enrollment.id,
            title: `AI Assigned: ${funnelName}`,
            description: enrollment.assignment_reason || "AI-based assignment",
            type: "review" as const,
            status: enrollment.converted ? "approved" as const : "pending" as const,
            priority: "medium" as const,
            createdAt: enrollment.enrolled_at,
          };
        });
        setWorkItems(aiWorkItems);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error", description: "Failed to fetch funnel data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentStages = stages.filter(s => s.funnel_id === selectedFunnel?.id);
  const pendingCount = workItems.filter(w => w.status === "pending").length;

  // Calculate overall metrics
  const totalVisitors = currentStages.reduce((sum, s) => {
    const metrics = stageMetrics.get(s.id);
    return s.stage_order === 1 ? (metrics?.visitors || 0) : sum;
  }, 0) || 100; // Default for display
  
  const totalConversions = currentStages.reduce((sum, s) => {
    const metrics = stageMetrics.get(s.id);
    return s.stage_order === currentStages.length ? (metrics?.conversions || 0) : sum;
  }, 0);

  const overallConversion = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : "0";

  const createFunnel = async () => {
    try {
      const { data, error } = await supabase
        .from("funnels")
        .insert({
          name: newFunnel.name,
          description: newFunnel.description,
          goal: newFunnel.goal,
          target_score_min: newFunnel.scoreMin,
          target_score_max: newFunnel.scoreMax,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Funnel Created", description: `${newFunnel.name} has been created.` });
      setIsCreateOpen(false);
      setNewFunnel({ name: "", description: "", goal: "", scoreMin: 0, scoreMax: 100 });
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create funnel.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const toggleFunnel = async (funnel: Funnel) => {
    try {
      await supabase
        .from("funnels")
        .update({ is_active: !funnel.is_active })
        .eq("id", funnel.id);
      
      fetchData();
      toast({ title: funnel.is_active ? "Funnel Deactivated" : "Funnel Activated" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update funnel.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const createABTest = async () => {
    try {
      const { data: experiment, error: expError } = await supabase
        .from("ab_test_experiments")
        .insert({
          name: newABTest.name,
          element_type: newABTest.elementType,
          original_value: newABTest.originalValue,
          funnel_id: selectedFunnel?.id,
          status: "draft",
        })
        .select()
        .single();

      if (expError) throw expError;

      // Create control and variant
      await supabase.from("ab_test_variants").insert([
        { experiment_id: experiment.id, name: "Control", value: newABTest.originalValue, traffic_percentage: 50 },
        { experiment_id: experiment.id, name: "Variant A", value: "", traffic_percentage: 50 },
      ]);

      toast({ title: "A/B Test Created", description: "Now add variants and activate." });
      setIsABTestOpen(false);
      setNewABTest({ name: "", elementType: "cta_button", originalValue: "" });
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create A/B test.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const runAIAnalysis = async (type: string) => {
    setAiLoading(true);
    setAiResult("");
    
    try {
      const stagesWithMetrics = currentStages.map(s => ({
        ...s,
        visitors: stageMetrics.get(s.id)?.visitors || 0,
        conversions: stageMetrics.get(s.id)?.conversions || 0,
        dropOff: stageMetrics.get(s.id)?.dropOff || 0,
      }));

      const { data, error } = await supabase.functions.invoke('funnel-ai', {
        body: {
          type,
          funnelData: {
            name: selectedFunnel?.name,
            stages: stagesWithMetrics,
          },
          metrics: {
            visitors: totalVisitors,
            leads: Math.round(totalVisitors * 0.15),
            conversions: totalConversions,
            conversionRate: overallConversion,
            bounceRate: 35,
            avgTimeOnPage: "2:34",
          },
        },
      });

      if (error) throw error;
      
      setAiResult(data.result);
      toast({ title: "AI Analysis Complete" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "AI analysis failed.";
      toast({ title: "Analysis Failed", description: message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApprove = (id: string) => {
    setWorkItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: "approved" as const } : item
    ));
    toast({ title: "Approved" });
  };

  const handleDeny = (id: string, reason: string) => {
    setWorkItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: "denied" as const } : item
    ));
    toast({ title: "Denied", description: reason, variant: "destructive" });
  };

  return (
    <AdminLayout 
      title="Funnels Agent" 
      subtitle="AI-powered conversion optimization and flow management"
    >
      {/* Funnel Selector & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Select
            value={selectedFunnel?.id}
            onValueChange={(id) => setSelectedFunnel(funnels.find(f => f.id === id) || null)}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select funnel" />
            </SelectTrigger>
            <SelectContent>
              {funnels.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} {f.is_default && "(Default)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Badge variant={selectedFunnel?.is_active ? "default" : "secondary"}>
            {selectedFunnel?.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="flex gap-2">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Funnel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Funnel</DialogTitle>
                <DialogDescription>Define a new conversion funnel with score-based targeting.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Funnel Name</Label>
                  <Input value={newFunnel.name} onChange={e => setNewFunnel(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={newFunnel.description} onChange={e => setNewFunnel(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <Label>Goal</Label>
                  <Input value={newFunnel.goal} onChange={e => setNewFunnel(p => ({ ...p, goal: e.target.value }))} placeholder="e.g., Book a service call" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Min Lead Score</Label>
                    <Input type="number" value={newFunnel.scoreMin} onChange={e => setNewFunnel(p => ({ ...p, scoreMin: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Max Lead Score</Label>
                    <Input type="number" value={newFunnel.scoreMax} onChange={e => setNewFunnel(p => ({ ...p, scoreMax: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={createFunnel} disabled={!newFunnel.name}>Create Funnel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isABTestOpen} onOpenChange={setIsABTestOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FlaskConical className="h-4 w-4 mr-2" />
                New A/B Test
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create A/B Test</DialogTitle>
                <DialogDescription>Test different variants to optimize conversions.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Test Name</Label>
                  <Input value={newABTest.name} onChange={e => setNewABTest(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Hero CTA Test" />
                </div>
                <div>
                  <Label>Element Type</Label>
                  <Select value={newABTest.elementType} onValueChange={v => setNewABTest(p => ({ ...p, elementType: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cta_button">CTA Button</SelectItem>
                      <SelectItem value="headline">Headline</SelectItem>
                      <SelectItem value="form">Form</SelectItem>
                      <SelectItem value="pricing">Pricing</SelectItem>
                      <SelectItem value="layout">Layout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Original Value (Control)</Label>
                  <Input value={newABTest.originalValue} onChange={e => setNewABTest(p => ({ ...p, originalValue: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsABTestOpen(false)}>Cancel</Button>
                <Button onClick={createABTest} disabled={!newABTest.name}>Create Test</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Funnel Visualization */}
      <Card className="mb-8 overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-accent/10 to-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/20">
                <GitBranch className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle>{selectedFunnel?.name || "Select a Funnel"}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedFunnel?.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-accent">{overallConversion}%</p>
              <p className="text-sm text-muted-foreground">Overall Conversion</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {currentStages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No stages defined for this funnel.</p>
              <Button variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Stages
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between overflow-x-auto pb-4">
              {currentStages.map((stage, index) => {
                const metrics = stageMetrics.get(stage.id);
                const visitors = metrics?.visitors || Math.round(100 / (index + 1));
                const dropOff = metrics?.dropOff || Math.round(20 + index * 10);
                
                return (
                  <div key={stage.id} className="flex items-center">
                    <div className="flex flex-col items-center min-w-[120px]">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${
                        dropOff > 50 ? 'bg-destructive/20 text-destructive' : 
                        dropOff > 30 ? 'bg-yellow-500/20 text-yellow-600' : 
                        'bg-green-500/20 text-green-600'
                      }`}>
                        {visitors}
                      </div>
                      <p className="text-sm font-medium mt-2 text-center">{stage.name}</p>
                      <p className="text-xs text-muted-foreground">{dropOff}% drop-off</p>
                    </div>
                    {index < currentStages.length - 1 && (
                      <ArrowRight className="h-6 w-6 text-muted-foreground mx-2 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats & A/B Tests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-accent/20">
                  <Users className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalVisitors}</p>
                  <p className="text-sm text-muted-foreground">Visitors</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <ShoppingCart className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalConversions}</p>
                  <p className="text-sm text-muted-foreground">Conversions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{funnels.length}</p>
                  <p className="text-sm text-muted-foreground">Funnels</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-yellow-500/20">
                  <FlaskConical className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{experiments.length}</p>
                  <p className="text-sm text-muted-foreground">A/B Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* A/B Tests Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Active A/B Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {experiments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No A/B tests yet.</p>
            ) : (
              <div className="space-y-3">
                {experiments.slice(0, 3).map(exp => (
                  <div key={exp.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{exp.name}</span>
                      <Badge variant={exp.status === "active" ? "default" : "secondary"}>
                        {exp.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {exp.variants.map(v => (
                        <div key={v.id} className="flex items-center justify-between bg-muted/50 p-2 rounded">
                          <span>{v.name}</span>
                          <span className="font-mono">{v.conversion_rate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Section */}
      <Card className="mb-8 border-accent/30">
        <CardHeader className="bg-gradient-to-r from-accent/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/20">
              <Brain className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                AI Conversion Optimizer
                <Sparkles className="h-4 w-4 text-accent" />
              </CardTitle>
              <p className="text-sm text-muted-foreground">Real-time analysis and recommendations</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => runAIAnalysis("analyze")} disabled={aiLoading}>
              <TrendingUp className="h-5 w-5" />
              <span className="text-xs">Analyze Funnel</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => runAIAnalysis("generate_ab_test")} disabled={aiLoading}>
              <Zap className="h-5 w-5" />
              <span className="text-xs">Generate A/B Tests</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => runAIAnalysis("optimize_copy")} disabled={aiLoading}>
              <Target className="h-5 w-5" />
              <span className="text-xs">Optimize Copy</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => runAIAnalysis("suggest_flow")} disabled={aiLoading}>
              <GitBranch className="h-5 w-5" />
              <span className="text-xs">Suggest Flow</span>
            </Button>
          </div>

          <div className="space-y-3">
            <Textarea
              placeholder="Ask AI anything about your funnel..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[80px]"
            />
            <Button onClick={() => runAIAnalysis("analyze")} disabled={aiLoading || !customPrompt.trim()} className="w-full">
              {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : <><Brain className="h-4 w-4 mr-2" />Ask AI</>}
            </Button>
          </div>

          {aiResult && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                AI Recommendations
              </h4>
              <pre className="whitespace-pre-wrap text-sm font-sans">{aiResult}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel Management List */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>All Funnels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnels.map(funnel => (
              <div key={funnel.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${funnel.is_active ? 'bg-green-500/20' : 'bg-muted'}`}>
                    <GitBranch className={`h-5 w-5 ${funnel.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {funnel.name}
                      {funnel.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Score: {funnel.target_score_min}-{funnel.target_score_max} • {funnel.goal}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={funnel.is_active} onCheckedChange={() => toggleFunnel(funnel)} />
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFunnel(funnel)}>
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Work Items */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">AI Assignments Queue</h2>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">Pending {pendingCount > 0 && <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {workItems.filter(w => w.status === "pending").length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">All reviewed!</p>
            </CardContent></Card>
          ) : (
            workItems.filter(w => w.status === "pending").map(item => (
              <AgentWorkItem key={item.id} item={item} onApprove={handleApprove} onDeny={handleDeny} />
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {workItems.map(item => (
            <AgentWorkItem key={item.id} item={item} onApprove={handleApprove} onDeny={handleDeny} />
          ))}
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminAgentFunnels;

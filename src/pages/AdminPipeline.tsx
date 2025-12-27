import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  DollarSign, 
  TrendingUp, 
  Target, 
  AlertTriangle,
  Plus,
  GripVertical,
  Brain,
  Sparkles
} from "lucide-react";
import { RevenueForecast } from "@/components/pipeline/RevenueForecast";
import { RevenueIntelligence } from "@/components/pipeline/RevenueIntelligence";
import { StatCardWithTooltip } from "@/components/StatCardWithTooltip";
import { PageShell } from "@/components/PageShell";
import { AssistantStrip } from "@/components/AssistantStrip";

interface Deal {
  id: string;
  name: string;
  company: string | null;
  value: number;
  stage: string;
  probability: number;
  expected_close_date: string | null;
  days_in_stage: number;
  next_action: string | null;
  sales_methodology: string | null;
  buying_signals: Record<string, unknown>[] | null;
  competitor_mentions: Record<string, unknown>[] | null;
  sentiment_score: number;
  lead_id: string | null;
}

const STAGES = [
  { id: 'discovery', label: 'Discovery', probability: 10, color: 'bg-slate-500' },
  { id: 'qualification', label: 'Qualification', probability: 25, color: 'bg-blue-500' },
  { id: 'proposal', label: 'Proposal', probability: 50, color: 'bg-yellow-500' },
  { id: 'negotiation', label: 'Negotiation', probability: 75, color: 'bg-orange-500' },
  { id: 'closed_won', label: 'Closed Won', probability: 100, color: 'bg-green-500' },
  { id: 'closed_lost', label: 'Closed Lost', probability: 0, color: 'bg-red-500' },
];

const PIPELINE_PROMPTS = [
  { label: "Deals to focus on", prompt: "Which deals should I focus on today?" },
  { label: "Close more deals", prompt: "How can I close more deals this month?" },
  { label: "Pipeline health", prompt: "How healthy is my pipeline?" },
  { label: "Stalled deals", prompt: "Which deals have been stalled the longest?" },
];

export default function AdminPipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({
    name: '',
    company: '',
    value: '',
    stage: 'discovery',
    next_action: ''
  });

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals(data || []);
    } catch (error) {
      console.error('Error fetching deals:', error);
      toast.error('Failed to load pipeline');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (deal: Deal) => {
    setDraggedDeal(deal);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedDeal || draggedDeal.stage === stageId) {
      setDraggedDeal(null);
      return;
    }

    const stage = STAGES.find(s => s.id === stageId);
    
    try {
      const { error } = await supabase
        .from('deal_pipeline')
        .update({ 
          stage: stageId, 
          probability: stage?.probability || 10,
          days_in_stage: 0 
        })
        .eq('id', draggedDeal.id);

      if (error) throw error;

      setDeals(prev => prev.map(d => 
        d.id === draggedDeal.id 
          ? { ...d, stage: stageId, probability: stage?.probability || 10, days_in_stage: 0 }
          : d
      ));

      toast.success(`Moved to ${stage?.label}`);
    } catch (error) {
      console.error('Error updating deal:', error);
      toast.error('Failed to move deal');
    }

    setDraggedDeal(null);
  };

  const handleAddDeal = async () => {
    if (!newDeal.name || !newDeal.value) {
      toast.error('Name and value are required');
      return;
    }

    const stage = STAGES.find(s => s.id === newDeal.stage);

    try {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .insert({
          name: newDeal.name,
          company: newDeal.company || null,
          value: parseFloat(newDeal.value),
          stage: newDeal.stage,
          probability: stage?.probability || 10,
          next_action: newDeal.next_action || null
        })
        .select()
        .single();

      if (error) throw error;

      setDeals(prev => [data, ...prev]);
      setNewDeal({ name: '', company: '', value: '', stage: 'discovery', next_action: '' });
      setShowAddDeal(false);
      toast.success('Deal added successfully');
    } catch (error) {
      console.error('Error adding deal:', error);
      toast.error('Failed to add deal');
    }
  };

  const getDealsByStage = (stageId: string) => {
    return deals.filter(d => d.stage === stageId);
  };

  const getStageTotal = (stageId: string) => {
    return getDealsByStage(stageId).reduce((sum, d) => sum + d.value, 0);
  };

  const getWeightedTotal = (stageId: string) => {
    return getDealsByStage(stageId).reduce((sum, d) => sum + (d.value * d.probability / 100), 0);
  };

  const totalPipelineValue = deals.reduce((sum, d) => sum + d.value, 0);
  const weightedPipelineValue = deals.reduce((sum, d) => sum + (d.value * d.probability / 100), 0);
  const avgDealSize = deals.length > 0 ? totalPipelineValue / deals.length : 0;

  const addDealButton = (
    <Dialog open={showAddDeal} onOpenChange={setShowAddDeal}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Deal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Deal Name</Label>
            <Input 
              value={newDeal.name} 
              onChange={e => setNewDeal({...newDeal, name: e.target.value})}
              placeholder="e.g., HVAC System Replacement"
            />
          </div>
          <div>
            <Label>Company</Label>
            <Input 
              value={newDeal.company} 
              onChange={e => setNewDeal({...newDeal, company: e.target.value})}
              placeholder="e.g., Smith Residence"
            />
          </div>
          <div>
            <Label>Value ($)</Label>
            <Input 
              type="number"
              value={newDeal.value} 
              onChange={e => setNewDeal({...newDeal, value: e.target.value})}
              placeholder="e.g., 15000"
            />
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={newDeal.stage} onValueChange={v => setNewDeal({...newDeal, stage: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.filter(s => !s.id.startsWith('closed')).map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Next Action</Label>
            <Textarea 
              value={newDeal.next_action} 
              onChange={e => setNewDeal({...newDeal, next_action: e.target.value})}
              placeholder="e.g., Schedule site visit"
            />
          </div>
          <Button onClick={handleAddDeal} className="w-full">Add Deal</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const assistantStrip = (
    <AssistantStrip
      pageContext="Deal Pipeline - managing sales opportunities and forecasting revenue"
      quickPrompts={PIPELINE_PROMPTS}
      placeholder="Ask about your deals or get sales tips..."
    />
  );

  return (
    <PageShell
      title="Deal Pipeline"
      subtitle="Drag deals between stages to update status"
      primaryAction={addDealButton}
      assistantStrip={assistantStrip}
      fullBleed
    >
      <div className="space-y-6 p-4 md:p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCardWithTooltip
            title="Total Pipeline"
            simpleTitle="Potential Deals"
            value={`$${totalPipelineValue.toLocaleString()}`}
            icon={<DollarSign className="h-5 w-5" />}
            tooltip="Total value of all deals you're currently working on"
            action="View all deals"
            onClick={() => {}}
            variant="primary"
          />
          <StatCardWithTooltip
            title="Weighted Value"
            simpleTitle="Likely Revenue"
            value={`$${weightedPipelineValue.toLocaleString()}`}
            icon={<TrendingUp className="h-5 w-5" />}
            tooltip="Total value multiplied by the chance of closing each deal - your realistic forecast"
            action="View high-probability deals"
            onClick={() => {}}
            variant="success"
          />
          <StatCardWithTooltip
            title="Avg Deal Size"
            simpleTitle="Average Job Value"
            value={`$${avgDealSize.toLocaleString()}`}
            icon={<Target className="h-5 w-5" />}
            tooltip="The typical amount you earn per deal - helps with planning"
            action="View deal sizes"
            onClick={() => {}}
            variant="primary"
          />
          <StatCardWithTooltip
            title="Active Deals"
            simpleTitle="Deals in Progress"
            value={deals.filter(d => !d.stage.startsWith('closed')).length}
            icon={<Brain className="h-5 w-5" />}
            tooltip="Number of deals you're actively working on right now"
            action="View active deals"
            onClick={() => {}}
            variant="primary"
          />
        </div>

        {/* AI Forecasting */}
        <RevenueForecast deals={deals} />

        {/* Kanban Pipeline */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 overflow-x-auto">
          {STAGES.map(stage => (
            <div
              key={stage.id}
              className="min-w-[280px]"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              <Card className="h-full">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                      <CardTitle className="text-sm font-medium">{stage.label}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {getDealsByStage(stage.id).length}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ${getStageTotal(stage.id).toLocaleString()} 
                    <span className="text-green-500 ml-1">
                      (${getWeightedTotal(stage.id).toLocaleString()} weighted)
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                  {getDealsByStage(stage.id).map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal)}
                      className={`p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                        draggedDeal?.id === deal.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{deal.name}</p>
                          {deal.company && (
                            <p className="text-xs text-muted-foreground truncate">{deal.company}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-semibold text-green-500">
                              ${deal.value.toLocaleString()}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {deal.probability}%
                            </Badge>
                          </div>
                          {deal.next_action && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              → {deal.next_action}
                            </p>
                          )}
                          {deal.days_in_stage > 7 && (
                            <div className="flex items-center gap-1 mt-2 text-amber-500">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-xs">{deal.days_in_stage} days in stage</span>
                            </div>
                          )}
                          {deal.sales_methodology && (
                            <Badge variant="secondary" className="text-xs mt-2">
                              <Sparkles className="h-3 w-3 mr-1" />
                              {deal.sales_methodology}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {getDealsByStage(stage.id).length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                      Drop deals here
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Revenue Intelligence */}
        <RevenueIntelligence deals={deals} />
      </div>
    </PageShell>
  );
}

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import AgentWorkItem, { WorkItem } from "@/components/AgentWorkItem";
import WorkItemDetailModal from "@/components/WorkItemDetailModal";
import AgentChatPanel from "@/components/AgentChatPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SEQUENCES_AGENT_PROMPT } from "@/data/agentPrompts";
import {
  Zap,
  Mail,
  Users,
  CheckCircle,
  RefreshCw,
  Clock,
} from "lucide-react";

const mockWorkItems: WorkItem[] = [
  {
    id: "1",
    title: "New Sequence: Hot Lead Nurture",
    description: "AI-designed 5-email sequence for leads scoring 70+.",
    type: "approval",
    status: "pending",
    priority: "high",
    createdAt: new Date().toISOString(),
    details: "This sequence targets high-intent leads with personalized follow-ups:\n\n1. Day 1: Welcome email with value proposition\n2. Day 3: Case study + social proof\n3. Day 5: Scarcity/urgency message\n4. Day 7: Objection handling\n5. Day 10: Final call-to-action with bonus offer",
    metadata: {
      budget: 0,
      roi: 340,
      audience: "Leads scoring 70+",
      reach: "~150 contacts",
    },
  },
  {
    id: "2",
    title: "Sequence Optimization: Welcome Series",
    description: "AI recommends changes to improve 12% lower open rate.",
    type: "review",
    status: "pending",
    priority: "medium",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    details: "Recommended optimizations:\n\n- Subject line A/B test: Current vs \"Your HVAC Emergency Plan\"\n- Add personalization tokens: {{first_name}}, {{city}}\n- Reduce email length by 30%\n- Move CTA above the fold\n- Add P.S. line with phone number",
    metadata: {
      budget: 0,
      roi: 45,
      audience: "New subscribers",
    },
  },
  {
    id: "3",
    title: "Pause Sequence: Cold Outreach v2",
    description: "High unsubscribe rate detected. AI recommends pause.",
    type: "approval",
    status: "pending",
    priority: "urgent",
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    details: "⚠️ URGENT: This sequence has a 4.2% unsubscribe rate (threshold: 2%)\n\nIssues identified:\n- Too aggressive sending frequency (3 emails in 5 days)\n- Subject lines perceived as spammy\n- No clear opt-out in first email\n- Missing value-first content\n\nRecommendation: Pause immediately and redesign.",
    metadata: {
      budget: 120,
      roi: -15,
      audience: "Cold leads",
    },
  },
];

const AdminAgentSequences = () => {
  const [workItems, setWorkItems] = useState<WorkItem[]>(mockWorkItems);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { toast } = useToast();

  const pendingCount = workItems.filter(w => w.status === "pending").length;

  const handleApprove = (id: string, notes?: string) => {
    setWorkItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, status: "approved" as const } : item
      )
    );
    toast({ title: "Sequence Approved", description: notes || undefined });
  };

  const handleDeny = (id: string, reason: string) => {
    setWorkItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, status: "denied" as const } : item
      )
    );
    toast({ title: "Rejected", description: reason, variant: "destructive" });
  };

  const handleDiscuss = (id: string) => {
    const item = workItems.find(w => w.id === id);
    if (item) {
      setSelectedItem(item);
      setDetailModalOpen(true);
    }
  };

  const handleViewDetails = (item: WorkItem) => {
    setSelectedItem(item);
    setDetailModalOpen(true);
  };

  const handleRefresh = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
    toast({ title: "Refreshed" });
  };

  return (
    <AdminLayout 
      title="Sequences Agent" 
      subtitle="AI-powered email and SMS automation"
    >
      <WorkItemDetailModal
        item={selectedItem}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onApprove={handleApprove}
        onDeny={handleDeny}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/20">
                    <Zap className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">6</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">142</p>
                    <p className="text-xs text-muted-foreground">Enrolled</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Mail className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">32%</p>
                    <p className="text-xs text-muted-foreground">Open Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Work Items */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sequences Queue</h2>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pending">
                Pending
                {pendingCount > 0 && <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              {workItems.filter(w => w.status === "pending").length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-medium">All sequences reviewed!</p>
                  </CardContent>
                </Card>
              ) : (
                workItems.filter(w => w.status === "pending").map(item => (
                  <AgentWorkItem
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    onDiscuss={handleDiscuss}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {workItems.filter(w => w.status !== "pending").map(item => (
                <AgentWorkItem key={item.id} item={item} />
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - AI Chat */}
        <div className="lg:col-span-1">
          <AgentChatPanel
            agentName="Sequences"
            agentType="sequences"
            systemPrompt={SEQUENCES_AGENT_PROMPT}
            className="h-[600px] sticky top-4"
          />
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentSequences;

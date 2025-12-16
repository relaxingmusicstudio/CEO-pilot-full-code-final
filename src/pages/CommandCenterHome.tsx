import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  Target,
  FileText,
  CheckCircle2,
  Zap,
  TrendingUp,
  Settings,
  Activity,
  Star,
  ChevronRight,
  Loader2,
  CreditCard,
  Phone,
  MessageSquare,
  Mail,
  Search,
  Share2,
  Bot,
  Inbox,
  UserPlus,
  HelpCircle,
} from "lucide-react";
import { useClickThrough } from "@/hooks/useClickThrough";

interface QuickAction {
  label: string;
  icon: typeof Users;
  path: string;
  count?: number;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive";
}

export default function CommandCenterHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { navigateToDetail, navigateToCEO } = useClickThrough();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLeads: 0,
    hotLeads: 0,
    pendingContent: 0,
    activePipeline: 0,
    vaultItems: 0,
  });

  useEffect(() => {
    fetchStats();

    // Listen for workspace refresh
    const handleRefresh = () => fetchStats();
    window.addEventListener("workspace-refresh", handleRefresh);
    return () => window.removeEventListener("workspace-refresh", handleRefresh);
  }, []);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Fetch leads
      const leadsRes = await supabase.from("leads").select("id, lead_temperature, lead_score");
      const leads = leadsRes.data || [];
      const hotLeads = leads.filter(l => l.lead_temperature === "hot" || (l.lead_score && l.lead_score >= 70));

      // Fetch pending content count
      const contentRes = await supabase.from("content").select("id").eq("status", "pending");
      
      // Fetch active pipeline count
      const pipelineRes = await supabase.from("deal_pipeline").select("id");
      const activePipeline = (pipelineRes.data || []).filter(d => d.id);
      
      // Fetch vault items count
      const vaultRes = await supabase.from("human_ratings").select("id").eq("saved_to_vault", true);

      setStats({
        totalLeads: leads.length,
        hotLeads: hotLeads.length,
        pendingContent: (contentRes.data || []).length,
        activePipeline: activePipeline.length,
        vaultItems: (vaultRes.data || []).length,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      label: "CRM & Leads",
      icon: Users,
      path: "crm",
      count: stats.totalLeads,
      badge: stats.hotLeads > 0 ? `${stats.hotLeads} hot` : undefined,
      badgeVariant: "destructive",
    },
    {
      label: "Sales Pipeline",
      icon: Target,
      path: "pipeline",
      count: stats.activePipeline,
    },
    {
      label: "Content",
      icon: FileText,
      path: "content",
      count: stats.pendingContent,
      badge: stats.pendingContent > 0 ? "Pending" : undefined,
    },
    {
      label: "Approvals",
      icon: CheckCircle2,
      path: "approvals",
    },
    {
      label: "Clients",
      icon: UserPlus,
      path: "clients",
    },
    {
      label: "Billing",
      icon: CreditCard,
      path: "billing",
    },
    {
      label: "Inbox",
      icon: Inbox,
      path: "inbox",
    },
    {
      label: "Contacts",
      icon: Users,
      path: "contacts",
    },
    {
      label: "Dialer",
      icon: Phone,
      path: "dialer",
    },
    {
      label: "Outreach",
      icon: Mail,
      path: "outreach",
    },
    {
      label: "SMS Campaigns",
      icon: MessageSquare,
      path: "sms",
    },
    {
      label: "Prospecting",
      icon: Search,
      path: "prospecting",
    },
    {
      label: "Retention",
      icon: TrendingUp,
      path: "retention",
    },
    {
      label: "Social Media",
      icon: Share2,
      path: "social",
    },
    {
      label: "Automation",
      icon: Bot,
      path: "automation",
    },
    {
      label: "Sequences",
      icon: Zap,
      path: "sequences",
    },
    {
      label: "Knowledge Vault",
      icon: Star,
      path: "vault",
      count: stats.vaultItems,
    },
    {
      label: "System Health",
      icon: Activity,
      path: "system-health",
    },
    {
      label: "Analytics",
      icon: TrendingUp,
      path: "analytics",
    },
    {
      label: "Settings",
      icon: Settings,
      path: "settings",
    },
    {
      label: "Help",
      icon: HelpCircle,
      path: "help",
    },
  ];

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Manage your business operations and data
          </p>
        </div>
        <Button onClick={navigateToCEO}>
          <Zap className="h-4 w-4 mr-2" />
          Back to AI CEO
        </Button>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Card
            key={action.path}
            className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
            onClick={() => navigate(`/app/command-center/${action.path}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{action.label}</p>
                  {action.count !== undefined && (
                    <p className="text-2xl font-bold">
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        action.count.toLocaleString()
                      )}
                    </p>
                  )}
                </div>
                {action.badge && (
                  <Badge variant={action.badgeVariant || "secondary"} className="text-xs">
                    {action.badge}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Quick Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{stats.totalLeads}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-orange-600">{stats.hotLeads}</p>
              <p className="text-xs text-muted-foreground">Hot Leads</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{stats.activePipeline}</p>
              <p className="text-xs text-muted-foreground">Active Deals</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{stats.pendingContent}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

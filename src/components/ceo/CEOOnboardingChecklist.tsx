import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowRight, Building2, Users, Phone, FileText, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  link?: string;
  icon: React.ReactNode;
}

interface CEOOnboardingChecklistProps {
  tenantId: string | null;
  onComplete?: () => void;
}

export function CEOOnboardingChecklist({ tenantId, onComplete }: CEOOnboardingChecklistProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (tenantId) {
      loadChecklistStatus();
    }
  }, [tenantId]);

  const loadChecklistStatus = async () => {
    if (!tenantId) return;

    setLoading(true);
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch all data in parallel
      const [
        profileResult,
        leadsResult,
        callLogsResult,
        invoicesResult,
        clientsResult,
      ] = await Promise.all([
        supabase
          .from("business_profile")
          .select("industry, services, avg_job_value, business_name")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        supabase
          .from("leads")
          .select("id, source", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", sevenDaysAgo.toISOString()),
        supabase
          .from("client_invoices")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
      ]);

      const profile = profileResult.data;
      const hasIndustry = Boolean(profile?.industry && profile.industry !== "general");
      const hasBusinessName = Boolean(profile?.business_name);
      const hasServices = Boolean(profile?.services && Array.isArray(profile.services) && profile.services.length > 0);
      const hasAvgJobValue = Boolean(profile?.avg_job_value && profile.avg_job_value > 0);
      const hasLeads = (leadsResult.count || 0) > 0;
      const hasRecentCalls = (callLogsResult.count || 0) > 0;
      const hasInvoices = (invoicesResult.count || 0) > 0;
      const hasClients = (clientsResult.count || 0) > 0;

      const items: ChecklistItem[] = [
        {
          id: "business_name",
          label: "Business Name",
          description: "Set your business name in your profile",
          complete: hasBusinessName,
          link: "/app/business-setup",
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          id: "industry",
          label: "Industry Selected",
          description: "Choose your business industry for tailored insights",
          complete: hasIndustry,
          link: "/app/business-setup",
          icon: <Sparkles className="h-4 w-4" />,
        },
        {
          id: "services",
          label: "Services Defined",
          description: "List your services for better lead qualification",
          complete: hasServices,
          link: "/app/business-setup",
          icon: <FileText className="h-4 w-4" />,
        },
        {
          id: "clients",
          label: "Active Clients",
          description: "Add at least one active client to track",
          complete: hasClients,
          link: "/app/clients",
          icon: <Users className="h-4 w-4" />,
        },
        {
          id: "calls",
          label: "Call Activity (7d)",
          description: "Recent call logs help track missed opportunities",
          complete: hasRecentCalls,
          link: "/app/pipeline",
          icon: <Phone className="h-4 w-4" />,
        },
      ];

      setChecklist(items);
      
      const completed = items.filter((i) => i.complete).length;
      const progressPct = Math.round((completed / items.length) * 100);
      setProgress(progressPct);

      if (progressPct === 100 && onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("Failed to load onboarding checklist:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedCount = checklist.filter((i) => i.complete).length;
  const isComplete = progress === 100;

  if (isComplete) {
    return null; // Hide when complete
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Complete Your Setup
            </CardTitle>
            <CardDescription>
              Finish setup to unlock full CEO Dashboard features
            </CardDescription>
          </div>
          <Badge variant={progress >= 80 ? "default" : "secondary"}>
            {completedCount}/{checklist.length} complete
          </Badge>
        </div>
        <Progress value={progress} className="mt-3 h-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {checklist.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              item.complete
                ? "bg-green-500/5 border-green-500/20"
                : "bg-muted/30 border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-3">
              {item.complete ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className={`font-medium text-sm ${item.complete ? "text-green-700 dark:text-green-400" : ""}`}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {!item.complete && item.link && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.link!)}
                className="text-primary"
              >
                Setup
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

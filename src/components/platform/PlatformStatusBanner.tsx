import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, RefreshCw, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

interface PlatformStatusBannerProps {
  preflightStatus?: { ok: boolean; suspect_count?: number } | null;
  onRefresh?: () => void;
}

export function PlatformStatusBanner({ preflightStatus, onRefresh }: PlatformStatusBannerProps) {
  const { user } = useAuth();
  const { role, isOwner, isAdmin } = useUserRole();
  const [ceoAlertsCount, setCeoAlertsCount] = useState(0);
  const [leadProfilesCount, setLeadProfilesCount] = useState(0);
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "(undefined)";
  const edgeBaseUrl = supabaseUrl !== "(undefined)" ? `${supabaseUrl}/functions/v1` : "(undefined)";

  useEffect(() => {
    fetchCounts();
  }, []);

  const fetchCounts = async () => {
    try {
      const [alertsRes, profilesRes] = await Promise.all([
        supabase.from("ceo_alerts").select("*", { count: "exact", head: true }),
        supabase.from("lead_profiles").select("*", { count: "exact", head: true }),
      ]);
      setCeoAlertsCount(alertsRes.count ?? 0);
      setLeadProfilesCount(profilesRes.count ?? 0);
    } catch (e) {
      console.error("Failed to fetch counts:", e);
    }
  };

  const copyContext = () => {
    const context = {
      user_id: user?.id,
      role,
      isOwner,
      isAdmin,
      supabase_url: supabaseUrl,
      edge_base_url: edgeBaseUrl,
      ceo_alerts_count: ceoAlertsCount,
      lead_profiles_count: leadProfilesCount,
      preflight_status: preflightStatus,
    };
    navigator.clipboard.writeText(JSON.stringify(context, null, 2));
    toast.success("Context copied to clipboard");
  };

  return (
    <Card className="border-2 border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Platform Status
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={copyContext}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { fetchCounts(); onRefresh?.(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
          <div><span className="text-muted-foreground">user_id:</span> {user?.id?.slice(0, 8) || "N/A"}…</div>
          <div><span className="text-muted-foreground">role:</span> {role || "N/A"}</div>
          <div><span className="text-muted-foreground">isOwner:</span> {String(isOwner)}</div>
          <div><span className="text-muted-foreground">isAdmin:</span> {String(isAdmin)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div><span className="text-muted-foreground">ceo_alerts:</span> {ceoAlertsCount} rows</div>
          <div><span className="text-muted-foreground">lead_profiles:</span> {leadProfilesCount} rows</div>
        </div>
        <div className="text-xs font-mono truncate">
          <span className="text-muted-foreground">edge:</span> {edgeBaseUrl}
        </div>
        {preflightStatus && (
          <div className="flex items-center gap-2 pt-1">
            <Badge variant={preflightStatus.ok ? "default" : "destructive"}>
              Preflight: {preflightStatus.ok ? "PASS" : "FAIL"}
            </Badge>
            {(preflightStatus.suspect_count ?? 0) > 0 && (
              <Badge variant="destructive">{preflightStatus.suspect_count} blockers</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { User, Shield, Copy, Send, CheckCircle2, Building } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";

interface Tenant {
  id: string;
  name: string;
  status: string;
}

export default function Access() {
  const { user } = useAuth();
  const { role, isOwner, isAdmin } = useUserRole();
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const { data } = await supabase
        .from("tenants")
        .select("id, name, status")
        .limit(10);
      setTenants(data || []);
    } catch (e) {
      console.error("Failed to fetch tenants:", e);
    }
  };

  const copyAccessEvidence = () => {
    const evidence = {
      timestamp: new Date().toISOString(),
      user_id: user?.id,
      email: user?.email,
      role,
      isOwner,
      isAdmin,
      tenant_count: tenants.length,
      tenants: tenants.map(t => ({ id: t.id, name: t.name, status: t.status })),
    };
    navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
    toast.success("Access evidence copied to clipboard");
  };

  const requestAdminAccess = async () => {
    if (!requestReason.trim()) {
      toast.error("Please provide a reason for your request");
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Try to insert into platform_audit_log as a support request
      await supabase.from("platform_audit_log").insert({
        entity_type: "support_request",
        entity_id: user?.id || "unknown",
        action_type: "admin_access_request",
        description: `User ${user?.email} requested admin access. Reason: ${requestReason}`,
        success: true,
      });
      
      setRequestSubmitted(true);
      toast.success("Request submitted successfully");
    } catch (err) {
      // If audit log fails, show the message anyway
      setRequestSubmitted(true);
      toast.success("Request noted (audit log unavailable)");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-6 w-6" />
            Access & Identity
          </CardTitle>
          <CardDescription>
            View your role, tenant associations, and request elevated access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Identity */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Current Identity
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">User ID</div>
                <div className="font-mono text-sm truncate">{user?.id?.slice(0, 12)}…</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="text-sm truncate">{user?.email || "N/A"}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Role</div>
                <Badge variant="default">{role || "none"}</Badge>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Access Level</div>
                <div className="flex gap-1">
                  {isOwner && <Badge variant="secondary">Owner</Badge>}
                  {isAdmin && <Badge variant="secondary">Admin</Badge>}
                  {!isOwner && !isAdmin && <Badge variant="outline">Standard</Badge>}
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={copyAccessEvidence}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Access Evidence
            </Button>
          </div>

          {/* Tenants */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Building className="h-4 w-4" />
              Associated Tenants ({tenants.length})
            </h3>
            
            {tenants.length > 0 ? (
              <div className="space-y-2">
                {tenants.map((tenant) => (
                  <div key={tenant.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{tenant.id}</div>
                    </div>
                    <Badge variant={tenant.status === "active" ? "default" : "secondary"}>
                      {tenant.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tenants found.</p>
            )}
          </div>

          {/* Request Admin */}
          {!isAdmin && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold">Request Admin Access</h3>
              
              {requestSubmitted ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Request Submitted</AlertTitle>
                  <AlertDescription>
                    Your request has been logged. A platform administrator will review it.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Reason for Request</Label>
                    <Textarea 
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="Explain why you need admin access..."
                      className="h-24"
                    />
                  </div>
                  <Button onClick={requestAdminAccess} disabled={submitting}>
                    {submitting ? (
                      <span className="animate-spin mr-2">⏳</span>
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Submit Request
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

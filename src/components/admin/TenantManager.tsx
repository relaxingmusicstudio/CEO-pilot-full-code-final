import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Building2, Users, Calendar, Rocket, FileText } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "suspended";
  plan: "starter" | "growth" | "scale";
  template_source: string;
  created_at: string;
  initialized_at: string | null;
  owner_user_id: string | null;
}

interface Template {
  id: string;
  template_key: string;
  display_name: string;
  description: string;
  is_active: boolean;
}

const TenantManager = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTenant, setNewTenant] = useState<{
    name: string;
    template_key: string;
    plan: "starter" | "growth" | "scale";
    owner_email: string;
  }>({
    name: "",
    template_key: "base",
    plan: "starter",
    owner_email: "",
  });

  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as Tenant[];
    },
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ["tenant-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_templates")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      return data as unknown as Template[];
    },
  });

  // Create tenant mutation
  const createTenantMutation = useMutation({
    mutationFn: async (tenantData: typeof newTenant) => {
      const { data, error } = await supabase.rpc("admin_create_tenant", {
        p_name: tenantData.name,
        p_template_key: tenantData.template_key,
        p_plan: tenantData.plan,
        p_owner_email: tenantData.owner_email || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Tenant created successfully");
      setIsCreateOpen(false);
      setNewTenant({ name: "", template_key: "base", plan: "starter", owner_email: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create tenant: ${error.message}`);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case "starter":
        return <Badge variant="outline">Starter</Badge>;
      case "growth":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Growth</Badge>;
      case "scale":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Scale</Badge>;
      default:
        return <Badge variant="outline">{plan}</Badge>;
    }
  };

  const handleCreateTenant = () => {
    if (!newTenant.name.trim()) {
      toast.error("Tenant name is required");
      return;
    }
    createTenantMutation.mutate(newTenant);
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tenant Management</h2>
          <p className="text-sm text-muted-foreground">Create and manage tenant instances</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
              <DialogDescription>
                Create a new tenant from a template. Blank tenants use the CEO to gather business info.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Business Name</Label>
                <Input
                  id="name"
                  placeholder="Acme Corporation"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <Select
                  value={newTenant.template_key}
                  onValueChange={(value) => setNewTenant({ ...newTenant, template_key: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template.template_key} value={template.template_key}>
                        <div className="flex items-center gap-2">
                          <span>{template.display_name}</span>
                          {template.template_key === "base" && (
                            <Badge variant="outline" className="text-xs">Blank</Badge>
                          )}
                          {template.template_key !== "base" && (
                            <Badge variant="secondary" className="text-xs">Demo</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newTenant.template_key === "base"
                    ? "CEO will gather all business info conversationally"
                    : "Demo template with pre-filled content (for testing only)"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan">Plan</Label>
                <Select
                  value={newTenant.plan}
                  onValueChange={(value: "starter" | "growth" | "scale") =>
                    setNewTenant({ ...newTenant, plan: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Owner Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@example.com"
                  value={newTenant.owner_email}
                  onChange={(e) => setNewTenant({ ...newTenant, owner_email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for unassigned tenant
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTenant} disabled={createTenantMutation.isPending}>
                {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Tenants</p>
                <p className="text-2xl font-bold">{tenants?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Rocket className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">
                  {tenants?.filter((t) => t.status === "active").length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <FileText className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">
                  {tenants?.filter((t) => t.status === "draft").length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">With Owner</p>
                <p className="text-2xl font-bold">
                  {tenants?.filter((t) => t.owner_user_id).length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
          <CardDescription>Manage tenant instances and their configurations</CardDescription>
        </CardHeader>
        <CardContent>
          {tenantsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Initialized</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      {tenant.template_source === "base" ? (
                        <Badge variant="outline">Blank</Badge>
                      ) : (
                        <Badge variant="secondary">{tenant.template_source}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{getPlanBadge(tenant.plan)}</TableCell>
                    <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant.initialized_at
                        ? new Date(tenant.initialized_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!tenants || tenants.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No tenants found. Create your first tenant to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TenantManager;

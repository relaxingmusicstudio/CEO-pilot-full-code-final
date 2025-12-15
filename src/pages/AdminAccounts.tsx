import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Users,
  Plus,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  DollarSign,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  employee_count: number | null;
  annual_revenue: number | null;
  tier: string | null;
  health_score: number | null;
  engagement_score: number | null;
  account_score: number | null;
  last_activity_at: string | null;
  created_at: string;
}

interface BuyingCommitteeMember {
  id: string;
  account_id: string | null;
  name: string;
  title: string | null;
  role_type: string | null;
  influence_level: number | null;
  engagement_status: string | null;
  notes: string | null;
  last_contacted_at: string | null;
}

const AdminAccounts = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "",
    industry: "",
    website: "",
    tier: "prospect",
  });
  const [newMember, setNewMember] = useState({
    name: "",
    title: "",
    role_type: "champion",
    influence_level: 5,
    notes: "",
  });

  // Fetch accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("account_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as Account[];
    },
  });

  // Fetch buying committee for selected account
  const { data: buyingCommittee = [] } = useQuery({
    queryKey: ["buying_committee", selectedAccount?.id],
    queryFn: async () => {
      if (!selectedAccount) return [];
      const { data, error } = await supabase
        .from("buying_committee")
        .select("*")
        .eq("account_id", selectedAccount.id)
        .order("influence_level", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as BuyingCommitteeMember[];
    },
    enabled: !!selectedAccount,
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (account: typeof newAccount) => {
      const { data, error } = await supabase
        .from("accounts")
        .insert({
          name: account.name,
          industry: account.industry || null,
          website: account.website || null,
          tier: account.tier,
          health_score: 50,
          engagement_score: 0,
          account_score: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setIsAddAccountOpen(false);
      setNewAccount({ name: "", industry: "", website: "", tier: "prospect" });
      toast.success("Account created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create account: " + error.message);
    },
  });

  // Create buying committee member mutation
  const createMemberMutation = useMutation({
    mutationFn: async (member: typeof newMember & { account_id: string }) => {
      const { data, error } = await supabase
        .from("buying_committee")
        .insert({
          account_id: member.account_id,
          name: member.name,
          title: member.title || null,
          role_type: member.role_type,
          influence_level: member.influence_level,
          notes: member.notes || null,
          engagement_status: "not_engaged",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buying_committee"] });
      setIsAddMemberOpen(false);
      setNewMember({ name: "", title: "", role_type: "champion", influence_level: 5, notes: "" });
      toast.success("Committee member added");
    },
    onError: (error) => {
      toast.error("Failed to add member: " + error.message);
    },
  });

  const filteredAccounts = accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.industry?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTierColor = (tier: string | null) => {
    switch (tier) {
      case "enterprise":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "strategic":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "growth":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getHealthColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getRoleIcon = (role: string | null) => {
    switch (role) {
      case "champion":
        return "🏆";
      case "decision_maker":
        return "👔";
      case "influencer":
        return "💡";
      case "blocker":
        return "🚫";
      case "user":
        return "👤";
      default:
        return "❓";
    }
  };

  // Summary stats
  const totalAccounts = accounts.length;
  const healthyAccounts = accounts.filter((a) => (a.health_score ?? 0) >= 70).length;
  const atRiskAccounts = accounts.filter((a) => (a.health_score ?? 0) < 40).length;
  const totalRevenue = accounts.reduce((sum, a) => sum + (a.annual_revenue ?? 0), 0);

  return (
    <AdminLayout
      title="Account-Based Management"
      subtitle="ABX strategy with buying committee tracking"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Accounts</p>
                <p className="text-2xl font-bold">{totalAccounts}</p>
              </div>
              <Building2 className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold text-green-500">{healthyAccounts}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold text-red-500">{atRiskAccounts}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">
                  ${(totalRevenue / 1000000).toFixed(1)}M
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg">Accounts</CardTitle>
              <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Account</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <Label>Company Name *</Label>
                      <Input
                        value={newAccount.name}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, name: e.target.value })
                        }
                        placeholder="Acme Corp"
                      />
                    </div>
                    <div>
                      <Label>Industry</Label>
                      <Input
                        value={newAccount.industry}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, industry: e.target.value })
                        }
                        placeholder="Technology"
                      />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input
                        value={newAccount.website}
                        onChange={(e) =>
                          setNewAccount({ ...newAccount, website: e.target.value })
                        }
                        placeholder="https://example.com"
                      />
                    </div>
                    <div>
                      <Label>Tier</Label>
                      <Select
                        value={newAccount.tier}
                        onValueChange={(value) =>
                          setNewAccount({ ...newAccount, tier: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prospect">Prospect</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="strategic">Strategic</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => createAccountMutation.mutate(newAccount)}
                      disabled={!newAccount.name || createAccountMutation.isPending}
                    >
                      {createAccountMutation.isPending ? "Creating..." : "Create Account"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {accountsLoading ? (
                  <p className="text-center text-muted-foreground py-4">Loading...</p>
                ) : filteredAccounts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No accounts found</p>
                ) : (
                  filteredAccounts.map((account) => (
                    <div
                      key={account.id}
                      onClick={() => setSelectedAccount(account)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedAccount?.id === account.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{account.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {account.industry || "No industry"}
                          </p>
                        </div>
                        <Badge variant="outline" className={getTierColor(account.tier)}>
                          {account.tier || "prospect"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1">
                          <Progress
                            value={account.health_score ?? 0}
                            className="h-1.5"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {account.health_score ?? 0}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Account Details */}
        <div className="lg:col-span-2">
          {selectedAccount ? (
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{selectedAccount.name}</CardTitle>
                    <p className="text-muted-foreground">
                      {selectedAccount.industry || "No industry"} •{" "}
                      {selectedAccount.website ? (
                        <a
                          href={selectedAccount.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Website
                        </a>
                      ) : (
                        "No website"
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className={getTierColor(selectedAccount.tier)}>
                    {selectedAccount.tier || "prospect"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview">
                  <TabsList className="mb-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="committee">Buying Committee</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Health Score</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div
                            className={`h-3 w-3 rounded-full ${getHealthColor(
                              selectedAccount.health_score
                            )}`}
                          />
                          <span className="text-xl font-bold">
                            {selectedAccount.health_score ?? 0}%
                          </span>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Engagement</p>
                        <p className="text-xl font-bold mt-1">
                          {selectedAccount.engagement_score ?? 0}%
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="text-xl font-bold mt-1">
                          {selectedAccount.employee_count?.toLocaleString() ?? "N/A"}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Annual Revenue</p>
                        <p className="text-xl font-bold mt-1">
                          {selectedAccount.annual_revenue
                            ? `$${(selectedAccount.annual_revenue / 1000000).toFixed(1)}M`
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Account Score Breakdown
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Firmographic Fit</span>
                          <span className="font-medium">85%</span>
                        </div>
                        <Progress value={85} className="h-2" />
                        <div className="flex justify-between text-sm">
                          <span>Intent Signals</span>
                          <span className="font-medium">72%</span>
                        </div>
                        <Progress value={72} className="h-2" />
                        <div className="flex justify-between text-sm">
                          <span>Engagement Level</span>
                          <span className="font-medium">{selectedAccount.engagement_score ?? 0}%</span>
                        </div>
                        <Progress value={selectedAccount.engagement_score ?? 0} className="h-2" />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="committee">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-muted-foreground">
                        {buyingCommittee.length} member(s) in buying committee
                      </p>
                      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <UserPlus className="h-4 w-4 mr-1" />
                            Add Member
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Committee Member</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div>
                              <Label>Name *</Label>
                              <Input
                                value={newMember.name}
                                onChange={(e) =>
                                  setNewMember({ ...newMember, name: e.target.value })
                                }
                                placeholder="John Smith"
                              />
                            </div>
                            <div>
                              <Label>Title</Label>
                              <Input
                                value={newMember.title}
                                onChange={(e) =>
                                  setNewMember({ ...newMember, title: e.target.value })
                                }
                                placeholder="VP of Operations"
                              />
                            </div>
                            <div>
                              <Label>Role Type</Label>
                              <Select
                                value={newMember.role_type}
                                onValueChange={(value) =>
                                  setNewMember({ ...newMember, role_type: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="champion">🏆 Champion</SelectItem>
                                  <SelectItem value="decision_maker">👔 Decision Maker</SelectItem>
                                  <SelectItem value="influencer">💡 Influencer</SelectItem>
                                  <SelectItem value="user">👤 User</SelectItem>
                                  <SelectItem value="blocker">🚫 Blocker</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Influence Level (1-10)</Label>
                              <Input
                                type="number"
                                min="1"
                                max="10"
                                value={newMember.influence_level}
                                onChange={(e) =>
                                  setNewMember({
                                    ...newMember,
                                    influence_level: parseInt(e.target.value) || 5,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Notes</Label>
                              <Textarea
                                value={newMember.notes}
                                onChange={(e) =>
                                  setNewMember({ ...newMember, notes: e.target.value })
                                }
                                placeholder="Additional notes about this contact..."
                              />
                            </div>
                            <Button
                              className="w-full"
                              onClick={() =>
                                createMemberMutation.mutate({
                                  ...newMember,
                                  account_id: selectedAccount.id,
                                })
                              }
                              disabled={!newMember.name || createMemberMutation.isPending}
                            >
                              {createMemberMutation.isPending ? "Adding..." : "Add Member"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {buyingCommittee.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>No buying committee members yet</p>
                        <p className="text-sm">Add key stakeholders to track engagement</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {buyingCommittee.map((member) => (
                          <div
                            key={member.id}
                            className="p-4 rounded-lg border flex items-start gap-4"
                          >
                            <div className="text-2xl">{getRoleIcon(member.role_type)}</div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{member.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {member.title || "No title"}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    member.engagement_status === "engaged"
                                      ? "bg-green-500/10 text-green-500"
                                      : member.engagement_status === "warm"
                                      ? "bg-yellow-500/10 text-yellow-500"
                                      : "bg-muted text-muted-foreground"
                                  }
                                >
                                  {member.engagement_status || "not_engaged"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm">
                                <span className="text-muted-foreground">
                                  Influence: {member.influence_level}/10
                                </span>
                                {member.last_contacted_at && (
                                  <span className="text-muted-foreground">
                                    Last contact:{" "}
                                    {new Date(member.last_contacted_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {member.notes && (
                                <p className="text-sm text-muted-foreground mt-2 italic">
                                  {member.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity">
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>Activity timeline coming soon</p>
                      <p className="text-sm">Track all interactions and touchpoints</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg">Select an account to view details</p>
                <p className="text-sm">Or create a new account to get started</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAccounts;

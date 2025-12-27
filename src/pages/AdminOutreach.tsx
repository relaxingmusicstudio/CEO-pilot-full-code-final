import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone, Users, Play, Pause, Plus, Target, TrendingUp, Zap } from "lucide-react";

interface OutreachCampaign {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  campaign_type?: string | null;
  total_contacts?: number | null;
  contacts_reached?: number | null;
  replies_received?: number | null;
  meetings_booked?: number | null;
  enrolled_count?: number | null;
  converted_count?: number | null;
  trigger_type?: string | null;
  touchpoints?: Array<{ count?: number | null }> | null;
}

const AdminOutreach = () => {
  const queryClient = useQueryClient();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignType, setCampaignType] = useState<'cold' | 'warm'>('cold');
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    campaign_type: 'email',
    daily_limit: 50,
  });

  // Get cold outreach campaigns
  const { data: coldCampaigns, isLoading: coldLoading } = useQuery<OutreachCampaign[]>({
    queryKey: ['cold-campaigns'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('cold-outreach-send', {
        body: { action: 'get_campaigns' }
      });
      return data?.campaigns || [];
    }
  });

  // Get warm nurture campaigns
  const { data: warmCampaigns, isLoading: warmLoading } = useQuery<OutreachCampaign[]>({
    queryKey: ['warm-campaigns'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('warm-nurture-trigger', {
        body: { action: 'get_campaigns' }
      });
      return data?.campaigns || [];
    }
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      if (campaignType === 'cold') {
        const { data, error } = await supabase.functions.invoke('cold-outreach-send', {
          body: {
            action: 'create_campaign',
            contact_data: newCampaign,
          }
        });
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.functions.invoke('warm-nurture-trigger', {
          body: {
            action: 'create_campaign',
            trigger_event: {
              name: newCampaign.name,
              description: newCampaign.description,
              trigger_type: 'manual',
            }
          }
        });
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      toast.success("Campaign created");
      setShowNewCampaign(false);
      setNewCampaign({ name: '', description: '', campaign_type: 'email', daily_limit: 50 });
      queryClient.invalidateQueries({ queryKey: ['cold-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['warm-campaigns'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create campaign";
      toast.error(message);
    }
  });

  // Execute campaign mutation
  const executeMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('cold-outreach-send', {
        body: {
          action: 'execute_campaign',
          campaign_id: campaignId,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Processed ${data.processed} contacts`);
      queryClient.invalidateQueries({ queryKey: ['cold-campaigns'] });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      case 'draft': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  return (
    <AdminLayout title="Outreach Campaigns">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Outreach Campaigns</h1>
            <p className="text-muted-foreground">Manage cold and warm outreach sequences</p>
          </div>
          <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={campaignType === 'cold' ? 'default' : 'outline'}
                    onClick={() => setCampaignType('cold')}
                    className="justify-start"
                  >
                    <Target className="h-4 w-4 mr-2" />
                    Cold Outreach
                  </Button>
                  <Button
                    variant={campaignType === 'warm' ? 'default' : 'outline'}
                    onClick={() => setCampaignType('warm')}
                    className="justify-start"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Warm Nurture
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    placeholder="Q1 Cold Outreach"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newCampaign.description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                    placeholder="Target HVAC contractors in Texas..."
                  />
                </div>
                
                {campaignType === 'cold' && (
                  <>
                    <div className="space-y-2">
                      <Label>Channel</Label>
                      <Select 
                        value={newCampaign.campaign_type}
                        onValueChange={(v) => setNewCampaign({ ...newCampaign, campaign_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="multi-channel">Multi-Channel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Daily Limit</Label>
                      <Input
                        type="number"
                        value={newCampaign.daily_limit}
                        onChange={(e) => setNewCampaign({ ...newCampaign, daily_limit: parseInt(e.target.value) })}
                      />
                    </div>
                  </>
                )}
                
                <Button 
                  className="w-full"
                  onClick={() => createCampaignMutation.mutate()}
                  disabled={!newCampaign.name || createCampaignMutation.isPending}
                >
                  Create Campaign
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Campaigns</p>
                  <p className="text-2xl font-bold">
                    {(coldCampaigns?.filter((c) => c.status === 'active').length || 0) +
                     (warmCampaigns?.filter((c) => c.status === 'active').length || 0)}
                  </p>
                </div>
                <Target className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Contacts</p>
                  <p className="text-2xl font-bold">
                    {coldCampaigns?.reduce((acc: number, c) => acc + (c.total_contacts || 0), 0) || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Replies</p>
                  <p className="text-2xl font-bold">
                    {coldCampaigns?.reduce((acc: number, c) => acc + (c.replies_received || 0), 0) || 0}
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Meetings Booked</p>
                  <p className="text-2xl font-bold">
                    {coldCampaigns?.reduce((acc: number, c) => acc + (c.meetings_booked || 0), 0) || 0}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="cold" className="space-y-4">
          <TabsList>
            <TabsTrigger value="cold">Cold Outreach</TabsTrigger>
            <TabsTrigger value="warm">Warm Nurture</TabsTrigger>
          </TabsList>

          <TabsContent value="cold" className="space-y-4">
            {coldLoading ? (
              <p className="text-muted-foreground">Loading campaigns...</p>
            ) : coldCampaigns?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">No cold outreach campaigns yet</p>
                  <p className="text-muted-foreground mb-4">Create your first campaign to start reaching new prospects</p>
                  <Button onClick={() => { setCampaignType('cold'); setShowNewCampaign(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {coldCampaigns?.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getChannelIcon(campaign.campaign_type)}
                          <div>
                            <CardTitle className="text-lg">{campaign.name}</CardTitle>
                            <CardDescription>{campaign.description}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                          {campaign.status === 'active' ? (
                            <Button variant="outline" size="sm">
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : campaign.status === 'draft' || campaign.status === 'paused' ? (
                            <Button 
                              size="sm"
                              onClick={() => executeMutation.mutate(campaign.id)}
                              disabled={executeMutation.isPending}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Run
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Contacts</p>
                          <p className="text-lg font-semibold">{campaign.total_contacts || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reached</p>
                          <p className="text-lg font-semibold">{campaign.contacts_reached || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Replies</p>
                          <p className="text-lg font-semibold">{campaign.replies_received || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reply Rate</p>
                          <p className="text-lg font-semibold">
                            {campaign.contacts_reached > 0 
                              ? ((campaign.replies_received / campaign.contacts_reached) * 100).toFixed(1) + '%'
                              : '0%'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Meetings</p>
                          <p className="text-lg font-semibold">{campaign.meetings_booked || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="warm" className="space-y-4">
            {warmLoading ? (
              <p className="text-muted-foreground">Loading campaigns...</p>
            ) : warmCampaigns?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">No warm nurture campaigns yet</p>
                  <p className="text-muted-foreground mb-4">Create behavioral-triggered nurture sequences</p>
                  <Button onClick={() => { setCampaignType('warm'); setShowNewCampaign(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {warmCampaigns?.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{campaign.name}</CardTitle>
                          <CardDescription>
                            Trigger: {campaign.trigger_type} • {campaign.touchpoints?.[0]?.count || 0} touchpoints
                          </CardDescription>
                        </div>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Enrolled</p>
                          <p className="text-lg font-semibold">{campaign.enrolled_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Converted</p>
                          <p className="text-lg font-semibold">{campaign.converted_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversion Rate</p>
                          <p className="text-lg font-semibold">
                            {campaign.enrolled_count > 0 
                              ? ((campaign.converted_count / campaign.enrolled_count) * 100).toFixed(1) + '%'
                              : '0%'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminOutreach;

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Send, Users, CheckCircle, XCircle, Clock, Plus, AlertTriangle, Smartphone } from "lucide-react";
import { PageChatHeader } from "@/components/PageChatHeader";
import { StatCardWithTooltip } from "@/components/StatCardWithTooltip";

interface SmsConfigStatus {
  twilio_configured?: boolean;
}

interface SmsCampaign {
  id: string;
  name: string;
  message?: string | null;
  status?: string | null;
  total_recipients?: number | null;
  sent_count?: number | null;
  delivered_count?: number | null;
  reply_count?: number | null;
  opt_out_count?: number | null;
}

const AdminSMSBlast = () => {
  const queryClient = useQueryClient();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [quickSmsPhone, setQuickSmsPhone] = useState("");
  const [quickSmsMessage, setQuickSmsMessage] = useState("");
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    body: '',
    type: 'blast',
    scheduled_at: '',
  });
  const [recipients, setRecipients] = useState<string>("");

  // Check Twilio config
  const { data: configStatus } = useQuery<SmsConfigStatus>({
    queryKey: ['twilio-config'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('sms-blast', {
        body: { action: 'check_config' }
      });
      return data;
    }
  });

  // Get SMS campaigns
  const { data: campaigns, isLoading } = useQuery<SmsCampaign[]>({
    queryKey: ['sms-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Get opt-outs count
  const { data: optOutCount } = useQuery({
    queryKey: ['sms-optouts'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('sms_opt_outs')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    }
  });

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const recipientList = recipients
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(phone => ({ phone_number: phone }));

      const { data, error } = await supabase.functions.invoke('sms-blast', {
        body: {
          action: 'create_campaign',
          message: newCampaign,
          recipients: recipientList,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Campaign created");
      setShowNewCampaign(false);
      setNewCampaign({ name: '', body: '', type: 'blast', scheduled_at: '' });
      setRecipients("");
      queryClient.invalidateQueries({ queryKey: ['sms-campaigns'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create campaign";
      toast.error(message);
    }
  });

  // Send campaign mutation
  const sendMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('sms-blast', {
        body: {
          action: 'send_campaign',
          campaign_id: campaignId,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.mock) {
        toast.info(`Simulated sending ${data.sent_count} SMS (Twilio not configured)`);
      } else {
        toast.success(`Sent ${data.sent_count} SMS`);
      }
      queryClient.invalidateQueries({ queryKey: ['sms-campaigns'] });
    }
  });

  // Quick send mutation
  const quickSendMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sms-blast', {
        body: {
          action: 'send_single',
          phone_number: quickSmsPhone,
          message: quickSmsMessage,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.mock) {
        toast.info("SMS simulated (Twilio not configured)");
      } else {
        toast.success("SMS sent");
      }
      setQuickSmsPhone("");
      setQuickSmsMessage("");
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'sending': return 'bg-blue-500';
      case 'scheduled': return 'bg-purple-500';
      case 'draft': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const totalSent = campaigns?.reduce((acc: number, c) => acc + (c.sent_count || 0), 0) || 0;
  const totalDelivered = campaigns?.reduce((acc: number, c) => acc + (c.delivered_count || 0), 0) || 0;

  return (
    <AdminLayout title="SMS Campaigns">
      <div className="p-6 space-y-6">
        <PageChatHeader
          pageContext="SMS Campaigns page - managing text message campaigns and quick sends"
          placeholder="Ask about your SMS campaigns, delivery rates, or how to improve engagement..."
          quickActions={[
            { label: "How can I improve delivery?", prompt: "How can I improve my SMS delivery rate?" },
            { label: "Best time to send?", prompt: "What's the best time to send SMS campaigns?" },
            { label: "Campaign ideas", prompt: "Give me ideas for effective SMS campaigns" },
          ]}
        />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">SMS Campaigns</h1>
            <p className="text-muted-foreground">Send text messages to your customers</p>
          </div>
          
          <div className="flex items-center gap-4">
            {!configStatus?.twilio_configured && (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-yellow-500">Twilio not configured</span>
              </div>
            )}
            <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Campaign
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create SMS Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                      placeholder="Flash Sale Announcement"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Message ({160 - newCampaign.body.length} chars remaining)</Label>
                    <Textarea
                      value={newCampaign.body}
                      onChange={(e) => setNewCampaign({ ...newCampaign, body: e.target.value.slice(0, 160) })}
                      placeholder="Hi {{first_name}}! Don't miss our special offer..."
                      maxLength={160}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use {"{{first_name}}"} for personalization. Keep under 160 chars for single SMS.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Recipients (one phone number per line)</Label>
                    <Textarea
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                      placeholder="+1234567890&#10;+0987654321&#10;+1122334455"
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      {recipients.split('\n').filter(l => l.trim()).length} recipients
                    </p>
                  </div>
                  
                  <Button 
                    className="w-full"
                    onClick={() => createMutation.mutate()}
                    disabled={!newCampaign.name || !newCampaign.body || !recipients || createMutation.isPending}
                  >
                    Create Campaign
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCardWithTooltip
            title="Total Campaigns"
            simpleTitle="Message Campaigns"
            value={campaigns?.length || 0}
            icon={<MessageSquare className="h-8 w-8" />}
            tooltip="Number of text message campaigns you've created"
            action="View all campaigns"
            onClick={() => {}}
            variant="primary"
          />
          
          <StatCardWithTooltip
            title="SMS Sent"
            simpleTitle="Texts Sent"
            value={totalSent}
            icon={<Send className="h-8 w-8" />}
            tooltip="Total number of text messages you've sent across all campaigns"
            action="View message history"
            onClick={() => {}}
            variant="primary"
          />
          
          <StatCardWithTooltip
            title="Delivery Rate"
            simpleTitle="Messages Delivered"
            value={totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) + '%' : '0%'}
            icon={<CheckCircle className="h-8 w-8" />}
            tooltip="Percentage of messages that successfully reached recipients"
            action="View delivery stats"
            onClick={() => {}}
            variant="success"
          />
          
          <StatCardWithTooltip
            title="Opt-Outs"
            simpleTitle="Unsubscribed"
            value={optOutCount}
            icon={<XCircle className="h-8 w-8" />}
            tooltip="People who asked to stop receiving your text messages"
            action="View unsubscribes"
            onClick={() => {}}
            variant="danger"
          />
        </div>

        <Tabs defaultValue="campaigns" className="space-y-4">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="quick-send">Quick Send</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            {isLoading ? (
              <p className="text-muted-foreground">Loading campaigns...</p>
            ) : campaigns?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">No SMS campaigns yet</p>
                  <p className="text-muted-foreground mb-4">Create your first SMS blast campaign</p>
                  <Button onClick={() => setShowNewCampaign(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {campaigns?.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{campaign.name}</CardTitle>
                          <CardDescription className="line-clamp-1">{campaign.message}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                          {campaign.status === 'draft' && (
                            <Button 
                              size="sm"
                              onClick={() => sendMutation.mutate(campaign.id)}
                              disabled={sendMutation.isPending}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Send Now
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Recipients</p>
                          <p className="text-lg font-semibold">{campaign.total_recipients || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Sent</p>
                          <p className="text-lg font-semibold">{campaign.sent_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Delivered</p>
                          <p className="text-lg font-semibold">{campaign.delivered_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Replies</p>
                          <p className="text-lg font-semibold">{campaign.reply_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Opt-Outs</p>
                          <p className="text-lg font-semibold">{campaign.opt_out_count || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quick-send">
            <Card>
              <CardHeader>
                <CardTitle>Quick SMS</CardTitle>
                <CardDescription>Send a single SMS message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={quickSmsPhone}
                    onChange={(e) => setQuickSmsPhone(e.target.value)}
                    placeholder="+1234567890"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Message ({160 - quickSmsMessage.length} chars remaining)</Label>
                  <Textarea
                    value={quickSmsMessage}
                    onChange={(e) => setQuickSmsMessage(e.target.value.slice(0, 160))}
                    placeholder="Your message here..."
                    maxLength={160}
                  />
                </div>
                
                <Button 
                  onClick={() => quickSendMutation.mutate()}
                  disabled={!quickSmsPhone || !quickSmsMessage || quickSendMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send SMS
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminSMSBlast;

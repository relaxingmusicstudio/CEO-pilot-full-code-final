import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings, Key, Youtube, Facebook, Video, Phone, MessageSquare, 
  TrendingUp, Search, BarChart3, CheckCircle, XCircle, Loader2,
  ArrowLeft, Save, TestTube, Zap
} from "lucide-react";
import { Link } from "react-router-dom";
import AIRateLimitConfig from "@/components/admin/AIRateLimitConfig";

interface ApiSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  is_configured: boolean;
  test_status: string | null;
  last_tested_at: string | null;
}

interface IntegrationConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  placeholder: string;
  required?: boolean;
}

const integrations: IntegrationConfig[] = [
  // Google / YouTube (Core for video platform)
  {
    key: "YOUTUBE_API_KEY",
    label: "YouTube Data API v3",
    description: "Channel analytics, video management, trending videos",
    icon: <Youtube className="h-5 w-5" />,
    category: "Google",
    placeholder: "AIza...",
    required: true
  },
  {
    key: "GOOGLE_OAUTH_CLIENT_ID",
    label: "Google OAuth Client ID",
    description: "User authentication & YouTube channel access",
    icon: <Key className="h-5 w-5" />,
    category: "Google",
    placeholder: "447868455528-...",
    required: true
  },
  {
    key: "GOOGLE_OAUTH_CLIENT_SECRET",
    label: "Google OAuth Client Secret",
    description: "OAuth authentication secret",
    icon: <Key className="h-5 w-5" />,
    category: "Google",
    placeholder: "GOCSPX-...",
    required: true
  },
  {
    key: "YOUTUBE_ANALYTICS_API",
    label: "YouTube Analytics API",
    description: "CTR, watch time & retention for A/B testing",
    icon: <BarChart3 className="h-5 w-5" />,
    category: "Google",
    placeholder: "Same as YouTube API key",
    required: false
  },
  // Social Media Publishing
  {
    key: "META_ACCESS_TOKEN",
    label: "Meta Access Token",
    description: "Facebook & Instagram auto-posting",
    icon: <Facebook className="h-5 w-5" />,
    category: "Social",
    placeholder: "EAA...",
    required: false
  },
  {
    key: "TIKTOK_ACCESS_TOKEN",
    label: "TikTok Access Token",
    description: "TikTok auto-posting & analytics",
    icon: <Video className="h-5 w-5" />,
    category: "Social",
    placeholder: "Your TikTok token",
    required: false
  },
  {
    key: "TWITTER_API_KEY",
    label: "Twitter/X API Key",
    description: "Twitter auto-posting & engagement",
    icon: <MessageSquare className="h-5 w-5" />,
    category: "Social",
    placeholder: "Your Twitter API key",
    required: false
  },
  {
    key: "LINKEDIN_ACCESS_TOKEN",
    label: "LinkedIn Access Token",
    description: "LinkedIn auto-posting for B2B content",
    icon: <TrendingUp className="h-5 w-5" />,
    category: "Social",
    placeholder: "Your LinkedIn token",
    required: false
  },
  // Video Production
  {
    key: "HEYGEN_API_KEY",
    label: "HeyGen API Key",
    description: "AI avatar video generation",
    icon: <Video className="h-5 w-5" />,
    category: "Video",
    placeholder: "Your HeyGen API key",
    required: false
  },
  {
    key: "ELEVENLABS_API_KEY",
    label: "ElevenLabs API Key",
    description: "AI voice cloning & text-to-speech",
    icon: <Phone className="h-5 w-5" />,
    category: "Video",
    placeholder: "Your ElevenLabs key",
    required: false
  },
  {
    key: "CLOUDINARY_API_KEY",
    label: "Cloudinary API Key",
    description: "Video processing & clip extraction",
    icon: <Video className="h-5 w-5" />,
    category: "Video",
    placeholder: "Your Cloudinary key",
    required: false
  },
  // Messaging (for HVAC leads)
  {
    key: "TWILIO_ACCOUNT_SID",
    label: "Twilio Account SID",
    description: "SMS notifications & voice calls",
    icon: <Phone className="h-5 w-5" />,
    category: "Messaging",
    placeholder: "AC...",
    required: false
  },
  {
    key: "TWILIO_AUTH_TOKEN",
    label: "Twilio Auth Token",
    description: "Twilio authentication",
    icon: <Key className="h-5 w-5" />,
    category: "Messaging",
    placeholder: "Your auth token",
    required: false
  },
  {
    key: "WHATSAPP_ACCESS_TOKEN",
    label: "WhatsApp Business API",
    description: "WhatsApp messaging for leads",
    icon: <MessageSquare className="h-5 w-5" />,
    category: "Messaging",
    placeholder: "Your WhatsApp token",
    required: false
  },
  // Ads
  {
    key: "GOOGLE_ADS_DEVELOPER_TOKEN",
    label: "Google Ads Developer Token",
    description: "Automated Google Ads management",
    icon: <BarChart3 className="h-5 w-5" />,
    category: "Ads",
    placeholder: "Your developer token",
    required: false
  }
];

const AdminSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, ApiSetting>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("api_settings")
        .select("*");

      if (error) throw error;

      const settingsMap: Record<string, ApiSetting> = {};
      const valuesMap: Record<string, string> = {};

      (data || []).forEach((setting: ApiSetting) => {
        settingsMap[setting.setting_key] = setting;
        valuesMap[setting.setting_key] = setting.setting_value || "";
      });

      setSettings(settingsMap);
      setFormValues(valuesMap);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const value = formValues[key] || "";
      const existingSetting = settings[key];

      if (existingSetting) {
        const { error } = await supabase
          .from("api_settings")
          .update({
            setting_value: value,
            is_configured: value.length > 0,
            updated_at: new Date().toISOString()
          })
          .eq("setting_key", key);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("api_settings")
          .insert({
            setting_key: key,
            setting_value: value,
            is_configured: value.length > 0
          });

        if (error) throw error;
      }

      toast({
        title: "Saved",
        description: `${key} has been updated successfully.`
      });

      fetchSettings();
    } catch (error) {
      console.error("Error saving setting:", error);
      toast({
        title: "Error",
        description: "Failed to save setting.",
        variant: "destructive"
      });
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (key: string) => {
    setTesting(key);
    try {
      const { data, error } = await supabase.functions.invoke("test-integration", {
        body: { integration_key: key }
      });

      if (error) throw error;

      await supabase
        .from("api_settings")
        .update({
          test_status: data?.success ? "success" : "failed",
          last_tested_at: new Date().toISOString()
        })
        .eq("setting_key", key);

      toast({
        title: data?.success ? "Connection Successful" : "Connection Failed",
        description: data?.message || (data?.success ? "API is working correctly." : "Please check your credentials."),
        variant: data?.success ? "default" : "destructive"
      });

      fetchSettings();
    } catch (error) {
      console.error("Error testing integration:", error);
      toast({
        title: "Test Failed",
        description: "Could not test the integration. Make sure the key is saved first.",
        variant: "destructive"
      });
    } finally {
      setTesting(null);
    }
  };

  const getStatusBadge = (setting: ApiSetting | undefined) => {
    if (!setting || !setting.is_configured) {
      return <Badge variant="outline" className="text-muted-foreground">Not Configured</Badge>;
    }
    if (setting.test_status === "success") {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        <CheckCircle className="h-3 w-3 mr-1" /> Connected
      </Badge>;
    }
    if (setting.test_status === "failed") {
      return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">
        <XCircle className="h-3 w-3 mr-1" /> Failed
      </Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Configured</Badge>;
  };

  const categories = [...new Set(integrations.map(i => i.category))];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/app" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Integration Settings</h1>
                  <p className="text-sm text-muted-foreground">Configure your API keys and integrations</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Integrations
            </TabsTrigger>
            <TabsTrigger value="ai-limits" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              AI Rate Limits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations">
            {categories.map(category => (
              <div key={category} className="mb-8">
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  {category === "Google" && <Youtube className="h-5 w-5 text-red-400" />}
                  {category === "Social" && <Facebook className="h-5 w-5 text-blue-400" />}
                  {category === "Video" && <Video className="h-5 w-5 text-purple-400" />}
                  {category === "Messaging" && <MessageSquare className="h-5 w-5 text-green-400" />}
                  {category === "Ads" && <BarChart3 className="h-5 w-5 text-orange-400" />}
                  {category} Integrations
                </h2>
                
                <div className="grid gap-4 md:grid-cols-2">
                  {integrations
                    .filter(i => i.category === category)
                    .map(integration => {
                      const setting = settings[integration.key];
                      return (
                        <Card key={integration.key} className="bg-card border-border">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${
                                  setting?.test_status === "success" 
                                    ? "bg-green-500/20" 
                                    : "bg-muted"
                                }`}>
                                  {integration.icon}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-base">{integration.label}</CardTitle>
                                    {integration.required && (
                                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                                        Required
                                      </Badge>
                                    )}
                                  </div>
                                  <CardDescription className="text-sm">{integration.description}</CardDescription>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Input
                              type="password"
                              placeholder={integration.placeholder}
                              value={formValues[integration.key] || ""}
                              onChange={(e) => setFormValues(prev => ({
                                ...prev,
                                [integration.key]: e.target.value
                              }))}
                              className="bg-background"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSave(integration.key)}
                                disabled={saving === integration.key}
                                className="flex-1"
                              >
                                {saving === integration.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Save className="h-4 w-4 mr-2" />
                                )}
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTest(integration.key)}
                                disabled={testing === integration.key || !setting?.is_configured}
                              >
                                {testing === integration.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <TestTube className="h-4 w-4 mr-2" />
                                )}
                                Test
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="ai-limits">
            <AIRateLimitConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminSettings;

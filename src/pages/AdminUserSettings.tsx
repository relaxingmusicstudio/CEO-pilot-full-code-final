import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  User,
  Bell,
  Brain,
  Shield,
  Palette,
  Save,
  Plus,
  X,
  FileText,
  Loader2,
} from "lucide-react";

interface BusinessProfile {
  businessName: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  serviceArea: string;
  services: string[];
  avgJobValue: string;
  monthlyCallVolume: string;
}

interface AIPreferences {
  autoApproveSequences: boolean;
  autoApproveContent: boolean;
  agentTone: "professional" | "friendly" | "casual";
  notifyOnHighPriority: boolean;
  dailyDigest: boolean;
  weeklyReports: boolean;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
}

const AdminUserSettings = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    serviceArea: "",
    services: [],
    avgJobValue: "351",
    monthlyCallVolume: "80",
  });

  const [aiPrefs, setAIPrefs] = useState<AIPreferences>({
    autoApproveSequences: false,
    autoApproveContent: false,
    agentTone: "professional",
    notifyOnHighPriority: true,
    dailyDigest: false,
    weeklyReports: true,
  });

  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([
    { id: "1", title: "Service Hours", content: "Monday-Friday 8am-6pm, Saturday 9am-2pm, 24/7 emergency available", category: "Operations" },
    { id: "2", title: "Pricing Guidelines", content: "Diagnostic fee: $89, AC repair avg: $350, Full replacement: $5,000-$12,000", category: "Pricing" },
  ]);

  const [newService, setNewService] = useState("");
  const [newKnowledge, setNewKnowledge] = useState({ title: "", content: "", category: "General" });
  const [showNewKnowledge, setShowNewKnowledge] = useState(false);

  // Load saved data
  useEffect(() => {
    const savedProfile = localStorage.getItem("business_profile");
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setProfile(prev => ({ ...prev, ...parsed }));
      } catch (e) {}
    }

    const savedPrefs = localStorage.getItem("ai_preferences");
    if (savedPrefs) {
      try {
        setAIPrefs(JSON.parse(savedPrefs));
      } catch (e) {}
    }

    const savedKnowledge = localStorage.getItem("knowledge_base");
    if (savedKnowledge) {
      try {
        setKnowledge(JSON.parse(savedKnowledge));
      } catch (e) {}
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    
    // Simulate save
    await new Promise(resolve => setTimeout(resolve, 800));
    
    localStorage.setItem("business_profile", JSON.stringify(profile));
    localStorage.setItem("ai_preferences", JSON.stringify(aiPrefs));
    localStorage.setItem("knowledge_base", JSON.stringify(knowledge));
    
    setSaving(false);
    toast({ title: "Settings saved successfully" });
  };

  const addService = () => {
    if (newService.trim() && !profile.services.includes(newService.trim())) {
      setProfile(prev => ({
        ...prev,
        services: [...prev.services, newService.trim()],
      }));
      setNewService("");
    }
  };

  const removeService = (service: string) => {
    setProfile(prev => ({
      ...prev,
      services: prev.services.filter(s => s !== service),
    }));
  };

  const addKnowledge = () => {
    if (newKnowledge.title.trim() && newKnowledge.content.trim()) {
      setKnowledge(prev => [
        ...prev,
        { ...newKnowledge, id: Date.now().toString() },
      ]);
      setNewKnowledge({ title: "", content: "", category: "General" });
      setShowNewKnowledge(false);
    }
  };

  const removeKnowledge = (id: string) => {
    setKnowledge(prev => prev.filter(k => k.id !== id));
  };

  return (
    <>
      <Helmet>
        <title>User Settings | ApexLocal360</title>
      </Helmet>
      <AdminLayout title="Settings" subtitle="Manage your business profile, AI preferences, and knowledge base">
        <div className="max-w-4xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 mb-6">
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Business</span>
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Knowledge</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">AI Prefs</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
            </TabsList>

            {/* Business Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Business Information</CardTitle>
                  <CardDescription>
                    This information helps your AI agent answer customer questions accurately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="businessName">Business Name</Label>
                      <Input
                        id="businessName"
                        value={profile.businessName}
                        onChange={(e) => setProfile(prev => ({ ...prev, businessName: e.target.value }))}
                        placeholder="e.g., Smith's HVAC Services"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Business Phone</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Business Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="contact@yourbusiness.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={profile.website}
                        onChange={(e) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://yourbusiness.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Business Address</Label>
                    <Input
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Main St, City, State ZIP"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceArea">Service Area</Label>
                    <Input
                      id="serviceArea"
                      value={profile.serviceArea}
                      onChange={(e) => setProfile(prev => ({ ...prev, serviceArea: e.target.value }))}
                      placeholder="e.g., Phoenix Metro Area, 50-mile radius"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="avgJobValue">Average Job Value ($)</Label>
                      <Input
                        id="avgJobValue"
                        type="number"
                        value={profile.avgJobValue}
                        onChange={(e) => setProfile(prev => ({ ...prev, avgJobValue: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyCallVolume">Monthly Call Volume</Label>
                      <Input
                        id="monthlyCallVolume"
                        type="number"
                        value={profile.monthlyCallVolume}
                        onChange={(e) => setProfile(prev => ({ ...prev, monthlyCallVolume: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Services Offered</CardTitle>
                  <CardDescription>
                    List all services your business provides so the AI can discuss them with customers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {profile.services.map((service) => (
                      <Badge key={service} variant="secondary" className="px-3 py-1.5 text-sm">
                        {service}
                        <button
                          onClick={() => removeService(service)}
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      placeholder="Add a service..."
                      onKeyDown={(e) => e.key === "Enter" && addService()}
                    />
                    <Button onClick={addService} size="icon">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Knowledge Base Tab */}
            <TabsContent value="knowledge" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Knowledge Base</CardTitle>
                      <CardDescription>
                        Add information your AI agent should know about your business.
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowNewKnowledge(true)} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Entry
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showNewKnowledge && (
                    <Card className="border-accent">
                      <CardContent className="pt-4 space-y-3">
                        <Input
                          placeholder="Title (e.g., Warranty Policy)"
                          value={newKnowledge.title}
                          onChange={(e) => setNewKnowledge(prev => ({ ...prev, title: e.target.value }))}
                        />
                        <Textarea
                          placeholder="Content..."
                          value={newKnowledge.content}
                          onChange={(e) => setNewKnowledge(prev => ({ ...prev, content: e.target.value }))}
                          className="min-h-[100px]"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowNewKnowledge(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={addKnowledge}>
                            Add to Knowledge Base
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {knowledge.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{item.title}</h4>
                              <Badge variant="outline" className="text-xs">{item.category}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.content}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeKnowledge(item.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {knowledge.length === 0 && !showNewKnowledge && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No knowledge entries yet. Add some to help your AI agent.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Preferences Tab */}
            <TabsContent value="ai" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Agent Behavior</CardTitle>
                  <CardDescription>
                    Configure how your AI agents operate and communicate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Auto-Approve Sequences</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically approve low-risk sequence recommendations.
                        </p>
                      </div>
                      <Switch
                        checked={aiPrefs.autoApproveSequences}
                        onCheckedChange={(checked) =>
                          setAIPrefs(prev => ({ ...prev, autoApproveSequences: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Auto-Approve Content</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically publish AI-generated content that meets quality thresholds.
                        </p>
                      </div>
                      <Switch
                        checked={aiPrefs.autoApproveContent}
                        onCheckedChange={(checked) =>
                          setAIPrefs(prev => ({ ...prev, autoApproveContent: checked }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Agent Communication Tone</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["professional", "friendly", "casual"] as const).map((tone) => (
                        <Button
                          key={tone}
                          variant={aiPrefs.agentTone === tone ? "default" : "outline"}
                          className="capitalize"
                          onClick={() => setAIPrefs(prev => ({ ...prev, agentTone: tone }))}
                        >
                          {tone}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>
                    Choose how and when you want to be notified.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">High Priority Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Immediate notifications for urgent items.
                      </p>
                    </div>
                    <Switch
                      checked={aiPrefs.notifyOnHighPriority}
                      onCheckedChange={(checked) =>
                        setAIPrefs(prev => ({ ...prev, notifyOnHighPriority: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Daily Digest</Label>
                      <p className="text-sm text-muted-foreground">
                        Summary of activity sent each morning.
                      </p>
                    </div>
                    <Switch
                      checked={aiPrefs.dailyDigest}
                      onCheckedChange={(checked) =>
                        setAIPrefs(prev => ({ ...prev, dailyDigest: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Weekly Reports</Label>
                      <p className="text-sm text-muted-foreground">
                        Comprehensive weekly performance report.
                      </p>
                    </div>
                    <Switch
                      checked={aiPrefs.weeklyReports}
                      onCheckedChange={(checked) =>
                        setAIPrefs(prev => ({ ...prev, weeklyReports: checked }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end mt-6">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save All Changes
            </Button>
          </div>
        </div>
      </AdminLayout>
    </>
  );
};

export default AdminUserSettings;

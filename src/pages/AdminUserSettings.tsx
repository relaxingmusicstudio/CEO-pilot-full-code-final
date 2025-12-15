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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  Bell,
  Brain,
  Save,
  Plus,
  X,
  FileText,
  Loader2,
  Download,
  Upload,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";

interface BusinessProfile {
  id?: string;
  business_name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  service_area: string;
  services: string[];
  avg_job_value: number;
  monthly_call_volume: number;
  business_hours: { start: string; end: string; days: string[] };
  timezone: string;
  ai_preferences: { tone: string; responseLength: string; personality: string };
  notification_settings: { emailAlerts: boolean; smsAlerts: boolean; dailyDigest: boolean };
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  is_ai_accessible: boolean;
  priority: number;
}

const CATEGORIES = ["general", "operations", "pricing", "services", "faq", "scripts", "policies"];

const AdminUserSettings = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");

  const [profile, setProfile] = useState<BusinessProfile>({
    business_name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    service_area: "",
    services: [],
    avg_job_value: 351,
    monthly_call_volume: 80,
    business_hours: { start: "08:00", end: "18:00", days: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
    timezone: "America/New_York",
    ai_preferences: { tone: "professional", responseLength: "concise", personality: "helpful" },
    notification_settings: { emailAlerts: true, smsAlerts: false, dailyDigest: true },
  });

  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [newService, setNewService] = useState("");
  const [newKnowledge, setNewKnowledge] = useState({ 
    title: "", 
    content: "", 
    category: "general",
    keywords: "",
    is_ai_accessible: true,
    priority: 5,
  });
  const [showNewKnowledge, setShowNewKnowledge] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load data from Supabase
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load business profile
      const { data: profileData } = await supabase.functions.invoke("knowledge-base", {
        body: { action: "get_profile" },
      });
      
      if (profileData?.profile) {
        setProfile((prev) => ({
          ...prev,
          ...profileData.profile,
          services: profileData.profile.services || [],
          business_hours: profileData.profile.business_hours || prev.business_hours,
          ai_preferences: profileData.profile.ai_preferences || prev.ai_preferences,
          notification_settings: profileData.profile.notification_settings || prev.notification_settings,
        }));
      }

      // Load knowledge base
      const { data: knowledgeData } = await supabase.functions.invoke("knowledge-base", {
        body: { action: "get_all_knowledge" },
      });
      
      if (knowledgeData?.knowledge) {
        setKnowledge(knowledgeData.knowledge);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({ title: "Error loading settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("knowledge-base", {
        body: { 
          action: "upsert_profile",
          ...profile,
        },
      });
      
      if (error) throw error;
      toast({ title: "Profile saved successfully" });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: "Error saving profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addService = () => {
    if (newService.trim() && !profile.services.includes(newService.trim())) {
      setProfile((prev) => ({
        ...prev,
        services: [...prev.services, newService.trim()],
      }));
      setNewService("");
    }
  };

  const removeService = (service: string) => {
    setProfile((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s !== service),
    }));
  };

  const addKnowledge = async () => {
    if (!newKnowledge.title.trim() || !newKnowledge.content.trim()) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("knowledge-base", {
        body: {
          action: "upsert_knowledge",
          title: newKnowledge.title,
          content: newKnowledge.content,
          category: newKnowledge.category,
          keywords: newKnowledge.keywords.split(",").map((k) => k.trim()).filter(Boolean),
          is_ai_accessible: newKnowledge.is_ai_accessible,
          priority: newKnowledge.priority,
        },
      });
      
      if (error) throw error;
      
      if (data?.knowledge) {
        setKnowledge((prev) => [...prev, data.knowledge]);
      }
      
      setNewKnowledge({ title: "", content: "", category: "general", keywords: "", is_ai_accessible: true, priority: 5 });
      setShowNewKnowledge(false);
      toast({ title: "Knowledge entry added" });
    } catch (error) {
      console.error("Error adding knowledge:", error);
      toast({ title: "Error adding knowledge", variant: "destructive" });
    }
  };

  const updateKnowledge = async (item: KnowledgeItem) => {
    try {
      const { error } = await supabase.functions.invoke("knowledge-base", {
        body: {
          action: "upsert_knowledge",
          id: item.id,
          title: item.title,
          content: item.content,
          category: item.category,
          keywords: item.keywords,
          is_ai_accessible: item.is_ai_accessible,
          priority: item.priority,
        },
      });
      
      if (error) throw error;
      setEditingId(null);
      toast({ title: "Knowledge entry updated" });
    } catch (error) {
      console.error("Error updating knowledge:", error);
      toast({ title: "Error updating knowledge", variant: "destructive" });
    }
  };

  const removeKnowledge = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("knowledge-base", {
        body: { action: "delete_knowledge", id },
      });
      
      if (error) throw error;
      setKnowledge((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "Knowledge entry removed" });
    } catch (error) {
      console.error("Error removing knowledge:", error);
      toast({ title: "Error removing knowledge", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("knowledge-base", {
        body: { action: "export_all" },
      });
      
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch (error) {
      console.error("Error exporting:", error);
      toast({ title: "Error exporting data", variant: "destructive" });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.knowledge && Array.isArray(data.knowledge)) {
        const { data: result, error } = await supabase.functions.invoke("knowledge-base", {
          body: { action: "bulk_import", entries: data.knowledge },
        });
        
        if (error) throw error;
        
        await loadData();
        toast({ title: `Imported ${result?.imported || 0} entries` });
      }
    } catch (error) {
      console.error("Error importing:", error);
      toast({ title: "Error importing data", variant: "destructive" });
    }
    
    event.target.value = "";
  };

  const filteredKnowledge = knowledge.filter((item) => {
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <AdminLayout title="Settings" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

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
                        value={profile.business_name}
                        onChange={(e) => setProfile((prev) => ({ ...prev, business_name: e.target.value }))}
                        placeholder="e.g., Smith's HVAC Services"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Business Phone</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Business Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="contact@yourbusiness.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={profile.website}
                        onChange={(e) => setProfile((prev) => ({ ...prev, website: e.target.value }))}
                        placeholder="https://yourbusiness.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Business Address</Label>
                    <Input
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Main St, City, State ZIP"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceArea">Service Area</Label>
                    <Input
                      id="serviceArea"
                      value={profile.service_area}
                      onChange={(e) => setProfile((prev) => ({ ...prev, service_area: e.target.value }))}
                      placeholder="e.g., Phoenix Metro Area, 50-mile radius"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="avgJobValue">Average Job Value ($)</Label>
                      <Input
                        id="avgJobValue"
                        type="number"
                        value={profile.avg_job_value}
                        onChange={(e) => setProfile((prev) => ({ ...prev, avg_job_value: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyCallVolume">Monthly Call Volume</Label>
                      <Input
                        id="monthlyCallVolume"
                        type="number"
                        value={profile.monthly_call_volume}
                        onChange={(e) => setProfile((prev) => ({ ...prev, monthly_call_volume: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  <Button onClick={handleSaveProfile} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Business Profile
                  </Button>
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
                        <button onClick={() => removeService(service)} className="ml-2 hover:text-destructive">
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
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                      <Label htmlFor="import-file" className="cursor-pointer">
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="h-4 w-4 mr-2" />
                            Import
                          </span>
                        </Button>
                        <input
                          id="import-file"
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={handleImport}
                        />
                      </Label>
                      <Button onClick={() => setShowNewKnowledge(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Entry
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search and Filter */}
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search knowledge..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* New Knowledge Form */}
                  {showNewKnowledge && (
                    <Card className="border-accent">
                      <CardContent className="pt-4 space-y-3">
                        <Input
                          placeholder="Title (e.g., Warranty Policy)"
                          value={newKnowledge.title}
                          onChange={(e) => setNewKnowledge((prev) => ({ ...prev, title: e.target.value }))}
                        />
                        <Textarea
                          placeholder="Content..."
                          value={newKnowledge.content}
                          onChange={(e) => setNewKnowledge((prev) => ({ ...prev, content: e.target.value }))}
                          className="min-h-[100px]"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Select
                            value={newKnowledge.category}
                            onValueChange={(val) => setNewKnowledge((prev) => ({ ...prev, category: val }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Keywords (comma separated)"
                            value={newKnowledge.keywords}
                            onChange={(e) => setNewKnowledge((prev) => ({ ...prev, keywords: e.target.value }))}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={newKnowledge.is_ai_accessible}
                              onCheckedChange={(checked) => setNewKnowledge((prev) => ({ ...prev, is_ai_accessible: checked }))}
                            />
                            <Label className="text-sm">AI can use this</Label>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setShowNewKnowledge(false)}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={addKnowledge}>
                              Add to Knowledge Base
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Knowledge List */}
                  {filteredKnowledge.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{item.title}</h4>
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                              {item.is_ai_accessible ? (
                                <span title="AI can access"><Eye className="h-3 w-3 text-green-500" /></span>
                              ) : (
                                <span title="Hidden from AI"><EyeOff className="h-3 w-3 text-muted-foreground" /></span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{item.content}</p>
                            {item.keywords && item.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.keywords.map((kw, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                const updated = { ...item, is_ai_accessible: !item.is_ai_accessible };
                                setKnowledge((prev) => prev.map((k) => (k.id === item.id ? updated : k)));
                                updateKnowledge(updated);
                              }}
                            >
                              {item.is_ai_accessible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeKnowledge(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filteredKnowledge.length === 0 && !showNewKnowledge && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No knowledge entries found. Add some to help your AI agent.</p>
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
                  <CardDescription>Configure how your AI agents operate and communicate.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Agent Communication Tone</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["professional", "friendly", "casual"].map((tone) => (
                        <Button
                          key={tone}
                          variant={profile.ai_preferences.tone === tone ? "default" : "outline"}
                          onClick={() =>
                            setProfile((prev) => ({
                              ...prev,
                              ai_preferences: { ...prev.ai_preferences, tone },
                            }))
                          }
                          className="capitalize"
                        >
                          {tone}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Response Length</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["concise", "balanced", "detailed"].map((length) => (
                        <Button
                          key={length}
                          variant={profile.ai_preferences.responseLength === length ? "default" : "outline"}
                          onClick={() =>
                            setProfile((prev) => ({
                              ...prev,
                              ai_preferences: { ...prev.ai_preferences, responseLength: length },
                            }))
                          }
                          className="capitalize"
                        >
                          {length}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={handleSaveProfile} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save AI Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose how you want to be notified about important events.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Email Alerts</Label>
                      <p className="text-sm text-muted-foreground">Receive email notifications for important events.</p>
                    </div>
                    <Switch
                      checked={profile.notification_settings.emailAlerts}
                      onCheckedChange={(checked) =>
                        setProfile((prev) => ({
                          ...prev,
                          notification_settings: { ...prev.notification_settings, emailAlerts: checked },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">SMS Alerts</Label>
                      <p className="text-sm text-muted-foreground">Receive SMS notifications for urgent matters.</p>
                    </div>
                    <Switch
                      checked={profile.notification_settings.smsAlerts}
                      onCheckedChange={(checked) =>
                        setProfile((prev) => ({
                          ...prev,
                          notification_settings: { ...prev.notification_settings, smsAlerts: checked },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Daily Digest</Label>
                      <p className="text-sm text-muted-foreground">Receive a daily summary of all activities.</p>
                    </div>
                    <Switch
                      checked={profile.notification_settings.dailyDigest}
                      onCheckedChange={(checked) =>
                        setProfile((prev) => ({
                          ...prev,
                          notification_settings: { ...prev.notification_settings, dailyDigest: checked },
                        }))
                      }
                    />
                  </div>

                  <Button onClick={handleSaveProfile} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Notification Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </>
  );
};

export default AdminUserSettings;

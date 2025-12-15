import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations } from "@/hooks/useIntegrations";
import { 
  Plug, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Search, 
  Sparkles,
  Shield,
  ExternalLink,
  Loader2,
  Trash2,
  TestTube
} from "lucide-react";

interface Service {
  service_key: string;
  display_name: string;
  description: string;
  category: string;
  icon_emoji: string;
  auth_method: string;
  credential_fields: any[];
  setup_instructions: any[];
  documentation_url?: string;
}

interface ConnectedService {
  service_key: string;
  display_name: string;
  icon_emoji: string;
  category: string;
  credential_type: string;
  connection_status: string;
  last_tested_at: string | null;
  expires_at: string | null;
}

export function IntegrationHub() {
  const { toast } = useToast();
  const { 
    listServices, 
    getService, 
    getSuggestions, 
    listCredentials, 
    storeCredential, 
    testCredential,
    deleteCredential,
    isLoading 
  } = useIntegrations();

  const [services, setServices] = useState<Service[]>([]);
  const [connectedServices, setConnectedServices] = useState<ConnectedService[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  
  // Connection dialog state
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [credentialInputs, setCredentialInputs] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [servicesData, credentialsData, suggestionsData] = await Promise.all([
        listServices(),
        listCredentials(),
        getSuggestions('hvac_basic'),
      ]);

      setServices(servicesData);
      setConnectedServices(credentialsData);
      setSuggestions(suggestionsData);

      // Extract unique categories
      const cats = [...new Set(servicesData.map((s: Service) => s.category))].filter(Boolean);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load integration data:', err);
      toast({
        title: "Error",
        description: "Failed to load integrations",
        variant: "destructive",
      });
    }
  }

  async function handleConnect(service: Service) {
    const fullService = await getService(service.service_key);
    if (fullService) {
      setSelectedService(fullService);
      setCredentialInputs({});
      setConnectDialogOpen(true);
    }
  }

  async function handleSaveCredential() {
    if (!selectedService) return;

    setIsSaving(true);
    try {
      const success = await storeCredential(selectedService.service_key, credentialInputs);
      
      if (success) {
        toast({
          title: "Connected!",
          description: `${selectedService.display_name} has been connected successfully.`,
        });
        setConnectDialogOpen(false);
        loadData(); // Refresh the list
      } else {
        toast({
          title: "Error",
          description: "Failed to save credential",
          variant: "destructive",
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest(serviceKey: string) {
    setIsTesting(serviceKey);
    try {
      const result = await testCredential(serviceKey);
      
      toast({
        title: result.success ? "Connection Healthy" : "Connection Issue",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      
      loadData(); // Refresh status
    } finally {
      setIsTesting(null);
    }
  }

  async function handleDisconnect(serviceKey: string) {
    if (!confirm(`Are you sure you want to disconnect ${serviceKey}?`)) return;
    
    const success = await deleteCredential(serviceKey);
    if (success) {
      toast({
        title: "Disconnected",
        description: `${serviceKey} has been removed.`,
      });
      loadData();
    }
  }

  // Filter services based on search and category
  const filteredServices = services.filter(s => {
    const matchesSearch = !searchQuery || 
      s.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const connectedKeys = new Set(connectedServices.map(c => c.service_key));

  function getStatusBadge(status: string) {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Healthy</Badge>;
      case 'degraded':
        return <Badge variant="secondary" className="bg-yellow-500 text-black"><AlertTriangle className="w-3 h-3 mr-1" /> Degraded</Badge>;
      case 'expired':
      case 'revoked':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6" />
            Integration Hub
          </h2>
          <p className="text-muted-foreground">
            Connect your tools and services to unlock powerful automations
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Connected Services Summary */}
      {connectedServices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              Connected Services ({connectedServices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectedServices.map((service) => (
                <div 
                  key={service.service_key}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{service.icon_emoji}</span>
                    <div>
                      <p className="font-medium">{service.display_name}</p>
                      {getStatusBadge(service.connection_status)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => handleTest(service.service_key)}
                      disabled={isTesting === service.service_key}
                    >
                      {isTesting === service.service_key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => handleDisconnect(service.service_key)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Recommended for You
            </CardTitle>
            <CardDescription>
              Based on your current setup and business type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {suggestions.slice(0, 5).map((suggestion) => (
                <Card 
                  key={suggestion.service_key}
                  className="min-w-[250px] cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleConnect(suggestion)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{suggestion.icon_emoji}</span>
                      <div>
                        <p className="font-medium">{suggestion.display_name}</p>
                        <p className="text-xs text-muted-foreground">{suggestion.category}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Browser */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>All Integrations</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search integrations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="capitalize">
                  {cat.replace('_', ' ')}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredServices.map((service) => {
                  const isConnected = connectedKeys.has(service.service_key);
                  
                  return (
                    <Card 
                      key={service.service_key}
                      className={`transition-all ${isConnected ? 'border-green-500/50 bg-green-500/5' : 'hover:border-primary'}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{service.icon_emoji}</span>
                            <div>
                              <p className="font-semibold">{service.display_name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{service.category}</p>
                            </div>
                          </div>
                          {isConnected && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {service.description}
                        </p>
                        <div className="flex gap-2">
                          {isConnected ? (
                            <Button size="sm" variant="outline" disabled>
                              Connected
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => handleConnect(service)}>
                              Connect
                            </Button>
                          )}
                          {service.documentation_url && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => window.open(service.documentation_url, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>

      {/* Connection Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedService?.icon_emoji}</span>
              Connect {selectedService?.display_name}
            </DialogTitle>
            <DialogDescription>
              {selectedService?.description}
            </DialogDescription>
          </DialogHeader>

          {selectedService?.setup_instructions && (
            <div className="space-y-3 my-4">
              <p className="font-medium text-sm">Setup Steps:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                {selectedService.setup_instructions.map((step: any) => (
                  <li key={step.step}>{step.description}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="space-y-4">
            {selectedService?.credential_fields?.map((field: any) => (
              <div key={field.key}>
                <label className="block text-sm font-medium mb-1">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </label>
                <Input
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={credentialInputs[field.key] || ''}
                  onChange={(e) => setCredentialInputs({
                    ...credentialInputs,
                    [field.key]: e.target.value,
                  })}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCredential} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
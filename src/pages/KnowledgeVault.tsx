import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Star,
  Search,
  Filter,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  ExternalLink,
  Bot,
  FileText,
  Users,
  Target,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useClickThrough } from "@/hooks/useClickThrough";

interface VaultItem {
  id: string;
  entity_type: string;
  entity_id: string;
  rating: string | null;
  saved_to_vault: boolean;
  notes: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const ENTITY_ICONS: Record<string, typeof Star> = {
  ai_response: Bot,
  content: FileText,
  lead: Users,
  deal: Target,
};

const ENTITY_LABELS: Record<string, string> = {
  ai_response: "AI Responses",
  content: "Content",
  lead: "Leads",
  deal: "Deals",
};

export default function KnowledgeVault() {
  const navigate = useNavigate();
  const { navigateToCEO } = useClickThrough();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRating, setFilterRating] = useState<string>("all");

  useEffect(() => {
    fetchVaultItems();
  }, []);

  const fetchVaultItems = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("human_ratings")
        .select("*")
        .eq("saved_to_vault", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error fetching vault items:", error);
      toast.error("Failed to load vault items");
    } finally {
      setIsLoading(false);
    }
  };

  const removeFromVault = async (id: string) => {
    try {
      const { error } = await supabase
        .from("human_ratings")
        .update({ saved_to_vault: false })
        .eq("id", id);

      if (error) throw error;
      setItems(prev => prev.filter(item => item.id !== id));
      toast.success("Removed from vault");
    } catch (error) {
      console.error("Error removing from vault:", error);
      toast.error("Failed to remove from vault");
    }
  };

  const exportVault = () => {
    const exportData = items.map(item => ({
      type: item.entity_type,
      rating: item.rating,
      notes: item.notes,
      created_at: item.created_at,
      metadata: item.metadata,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge-vault-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Vault exported successfully");
  };

  const filteredItems = items.filter(item => {
    const matchesType = filterType === "all" || item.entity_type === filterType;
    const matchesRating = filterRating === "all" || item.rating === filterRating;
    const matchesSearch = searchQuery === "" || 
      item.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.entity_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesType && matchesRating && matchesSearch;
  });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const type = item.entity_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, VaultItem[]>);

  const entityTypes = [...new Set(items.map(item => item.entity_type))];

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={navigateToCEO}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI CEO
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="h-6 w-6 text-yellow-500" />
              Knowledge Vault
            </h1>
            <p className="text-sm text-muted-foreground">
              Saved insights, rated content, and training data
            </p>
          </div>
        </div>
        <Button onClick={exportVault} disabled={items.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export Vault
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vault..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {entityTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {ENTITY_LABELS[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRating} onValueChange={setFilterRating}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="good">Good Only</SelectItem>
                <SelectItem value="bad">Bad Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{items.length}</div>
            <div className="text-sm text-muted-foreground">Total Saved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {items.filter(i => i.rating === "good").length}
            </div>
            <div className="text-sm text-muted-foreground">Rated Good</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {items.filter(i => i.rating === "bad").length}
            </div>
            <div className="text-sm text-muted-foreground">Rated Bad</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{entityTypes.length}</div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No saved items yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Items you rate and save will appear here for training and reference.
            </p>
            <Button onClick={navigateToCEO}>
              Go to AI CEO Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={entityTypes[0] || "all"}>
          <TabsList>
            {entityTypes.map(type => {
              const Icon = ENTITY_ICONS[type] || Star;
              return (
                <TabsTrigger key={type} value={type} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {ENTITY_LABELS[type] || type}
                  <Badge variant="secondary" className="ml-1">
                    {groupedItems[type]?.length || 0}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {entityTypes.map(type => (
            <TabsContent key={type} value={type}>
              <Card>
                <ScrollArea className="h-[500px]">
                  <div className="divide-y">
                    {groupedItems[type]?.map(item => {
                      const Icon = ENTITY_ICONS[item.entity_type] || Star;
                      return (
                        <div
                          key={item.id}
                          className="p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">
                                    {ENTITY_LABELS[item.entity_type] || item.entity_type}
                                  </span>
                                  {item.rating && (
                                    <Badge
                                      variant={item.rating === "good" ? "default" : "destructive"}
                                      className="text-xs"
                                    >
                                      {item.rating === "good" ? (
                                        <ThumbsUp className="h-3 w-3 mr-1" />
                                      ) : (
                                        <ThumbsDown className="h-3 w-3 mr-1" />
                                      )}
                                      {item.rating}
                                    </Badge>
                                  )}
                                </div>
                                {item.notes && (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {item.notes}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Saved {new Date(item.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  // Navigate to the entity detail page
                                  // This would be implemented based on entity type
                                }}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFromVault(item.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, TrendingUp, Database, Sparkles, RefreshCw, 
  ThumbsUp, ThumbsDown, Trash2, Activity, Zap 
} from "lucide-react";
import { useLearningSystem } from "@/hooks/useLearningSystem";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";

const AGENT_TYPES = ['funnel', 'content', 'ads', 'sequences', 'inbox', 'social', 'youtube', 'ceo'];

interface LearningStats {
  memory_count?: number;
  avg_success_score?: number;
  cache_hit_rate?: number;
  total_queries?: number;
  performance_history?: PerformanceEntry[];
}

interface PerformanceEntry {
  agent_type: string;
  date: string;
  total_queries: number;
  positive_feedback: number;
  negative_feedback: number;
  cache_hits: number;
}

interface AgentMemory {
  id: string;
  agent_type: string;
  success_score: number;
  usage_count: number;
  query: string;
  response: string;
}

interface LearningEvent {
  id: string;
  event_type: string;
  old_score: number;
  new_score: number;
  created_at: string;
}

const AdminLearning = () => {
  const { getStats, deleteMemory } = useLearningSystem();
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [learningEvents, setLearningEvents] = useState<LearningEvent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get stats
      const statsData = await getStats(selectedAgent || undefined);
      setStats(statsData);

      // Get memories
      let memoryQuery = supabase
        .from('agent_memories')
        .select('*')
        .order('success_score', { ascending: false })
        .limit(50);
      
      if (selectedAgent) {
        memoryQuery = memoryQuery.eq('agent_type', selectedAgent);
      }
      
      const { data: memoriesData } = await memoryQuery;
      setMemories(memoriesData || []);

      // Get recent learning events
      const { data: eventsData } = await supabase
        .from('learning_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      setLearningEvents(eventsData || []);
    } catch (err) {
      console.error('Error loading learning data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getStats, selectedAgent]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteMemory = async (memoryId: string) => {
    const success = await deleteMemory(memoryId);
    if (success) {
      toast.success('Memory deleted');
      loadData();
    } else {
      toast.error('Failed to delete memory');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <AdminLayout title="AI Learning Center">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              AI Learning Center
            </h1>
            <p className="text-muted-foreground">
              Monitor how your AI agents learn and improve over time
            </p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Memories</p>
                  <p className="text-2xl font-bold">{stats?.memory_count || 0}</p>
                </div>
                <Database className="h-8 w-8 text-primary/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Success Score</p>
                  <p className="text-2xl font-bold">{((stats?.avg_success_score || 0) * 100).toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
                  <p className="text-2xl font-bold">{(stats?.cache_hit_rate || 0).toFixed(1)}%</p>
                </div>
                <Zap className="h-8 w-8 text-yellow-500/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Queries</p>
                  <p className="text-2xl font-bold">{stats?.total_queries || 0}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500/20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Filter */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedAgent === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedAgent(null)}
          >
            All Agents
          </Button>
          {AGENT_TYPES.map((agent) => (
            <Button
              key={agent}
              variant={selectedAgent === agent ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedAgent(agent)}
            >
              {agent.charAt(0).toUpperCase() + agent.slice(1)}
            </Button>
          ))}
        </div>

        {/* Main Content */}
        <Tabs defaultValue="memories" className="space-y-4">
          <TabsList>
            <TabsTrigger value="memories">Memories</TabsTrigger>
            <TabsTrigger value="events">Learning Events</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="memories">
            <Card>
              <CardHeader>
                <CardTitle>Agent Memories</CardTitle>
                <CardDescription>
                  Successful interactions stored for future reference
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {memories.map((memory) => (
                      <div
                        key={memory.id}
                        className="p-4 border rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{memory.agent_type}</Badge>
                            <span className={`text-sm font-medium ${getScoreColor(memory.success_score)}`}>
                              {(memory.success_score * 100).toFixed(0)}% success
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Used {memory.usage_count}x
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMemory(memory.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Query:</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {memory.query}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Response:</p>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {memory.response}
                          </p>
                        </div>
                        <Progress value={memory.success_score * 100} className="h-1" />
                      </div>
                    ))}
                    {memories.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>No memories yet. Use the AI agents and provide feedback!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Recent Learning Events</CardTitle>
                <CardDescription>
                  Track how the system learns from feedback
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {learningEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-4 p-3 border rounded-lg"
                      >
                        {event.event_type === 'positive_feedback' ? (
                          <ThumbsUp className="h-5 w-5 text-green-500" />
                        ) : event.event_type === 'negative_feedback' ? (
                          <ThumbsDown className="h-5 w-5 text-red-500" />
                        ) : (
                          <Activity className="h-5 w-5 text-blue-500" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {event.event_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Score: {(event.old_score * 100).toFixed(0)}% → {(event.new_score * 100).toFixed(0)}%
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {learningEvents.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>No learning events yet</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance History</CardTitle>
                <CardDescription>
                  Daily performance metrics for each agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {stats?.performance_history?.map((perf, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{perf.agent_type}</Badge>
                          <span className="text-sm">{perf.date}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            Queries: {perf.total_queries}
                          </span>
                          <span className="text-green-500">
                            +{perf.positive_feedback} 👍
                          </span>
                          <span className="text-red-500">
                            -{perf.negative_feedback} 👎
                          </span>
                          <span className="text-blue-500">
                            {perf.cache_hits} hits
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!stats?.performance_history || stats.performance_history.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>Performance data will appear as agents are used</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminLearning;

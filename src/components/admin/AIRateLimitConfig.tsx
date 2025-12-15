import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Zap, 
  Save, 
  RefreshCw, 
  Loader2,
  AlertTriangle,
  Clock,
  Gauge
} from "lucide-react";

interface RateLimitConfig {
  id: string;
  agent_name: string;
  priority_level: string;
  requests_per_minute: number;
  requests_per_hour: number;
  requests_per_day: number;
  off_hours_multiplier: number;
  off_hours_start: string;
  off_hours_end: string;
  is_active: boolean;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  avgCostSaved: number;
}

const AIRateLimitConfig = () => {
  const [configs, setConfigs] = useState<RateLimitConfig[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<RateLimitConfig>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [configsRes, cacheRes] = await Promise.all([
        supabase.from('ai_rate_limits').select('*').order('agent_name'),
        supabase.from('ai_response_cache').select('hit_count, cost_estimate')
      ]);

      if (configsRes.error) throw configsRes.error;
      setConfigs(configsRes.data || []);

      // Calculate cache stats
      const cache = cacheRes.data || [];
      setCacheStats({
        totalEntries: cache.length,
        totalHits: cache.reduce((sum, c) => sum + (c.hit_count || 0), 0),
        avgCostSaved: cache.reduce((sum, c) => sum + ((c.cost_estimate || 0) * (c.hit_count || 0)), 0)
      });

    } catch (error) {
      console.error('Error fetching rate limit configs:', error);
      toast.error('Failed to load rate limit configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (config: RateLimitConfig) => {
    setEditingId(config.id);
    setEditValues(config);
  };

  const handleSave = async (id: string) => {
    setSaving(id);
    try {
      const { error } = await supabase
        .from('ai_rate_limits')
        .update({
          priority_level: editValues.priority_level,
          requests_per_minute: editValues.requests_per_minute,
          requests_per_hour: editValues.requests_per_hour,
          requests_per_day: editValues.requests_per_day,
          off_hours_multiplier: editValues.off_hours_multiplier,
          is_active: editValues.is_active
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Rate limit updated');
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error('Error saving rate limit:', error);
      toast.error('Failed to save rate limit');
    } finally {
      setSaving(null);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('ai_rate_limits')
        .update({ is_active: !currentState })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      toast.error('Failed to toggle rate limit');
    }
  };

  const clearExpiredCache = async () => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('ai_response_cache')
        .delete()
        .lt('expires_at', now);

      if (error) throw error;
      toast.success('Expired cache entries cleared');
      fetchData();
    } catch (error) {
      toast.error('Failed to clear cache');
    }
  };

  const clearAllCache = async () => {
    try {
      const { error } = await supabase
        .from('ai_response_cache')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      toast.success('All cache entries cleared');
      fetchData();
    } catch (error) {
      toast.error('Failed to clear cache');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cache Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            AI Response Cache
          </CardTitle>
          <CardDescription>
            Manage cached AI responses to reduce costs and latency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Cached Entries</div>
              <div className="text-2xl font-bold">{cacheStats?.totalEntries || 0}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Total Cache Hits</div>
              <div className="text-2xl font-bold">{cacheStats?.totalHits || 0}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Est. Savings</div>
              <div className="text-2xl font-bold text-green-500">
                ${cacheStats?.avgCostSaved.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearExpiredCache}>
              Clear Expired
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAllCache}>
              Clear All Cache
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limits Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                AI Rate Limits
              </CardTitle>
              <CardDescription>
                Configure rate limits per agent to control AI costs
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Per Minute</TableHead>
                <TableHead>Per Hour</TableHead>
                <TableHead>Off-Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map(config => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">{config.agent_name}</TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Select
                        value={editValues.priority_level}
                        onValueChange={(v) => setEditValues({...editValues, priority_level: v})}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={
                        config.priority_level === 'high' ? 'default' :
                        config.priority_level === 'low' ? 'secondary' : 'outline'
                      }>
                        {config.priority_level}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Input
                        type="number"
                        value={editValues.requests_per_minute}
                        onChange={(e) => setEditValues({...editValues, requests_per_minute: parseInt(e.target.value)})}
                        className="w-20"
                      />
                    ) : (
                      config.requests_per_minute
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Input
                        type="number"
                        value={editValues.requests_per_hour}
                        onChange={(e) => setEditValues({...editValues, requests_per_hour: parseInt(e.target.value)})}
                        className="w-20"
                      />
                    ) : (
                      config.requests_per_hour
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <Input
                        type="number"
                        step="0.1"
                        value={editValues.off_hours_multiplier}
                        onChange={(e) => setEditValues({...editValues, off_hours_multiplier: parseFloat(e.target.value)})}
                        className="w-16"
                      />
                    ) : (
                      <span className="text-muted-foreground">{config.off_hours_multiplier}x</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={editingId === config.id ? editValues.is_active : config.is_active}
                      onCheckedChange={() => {
                        if (editingId === config.id) {
                          setEditValues({...editValues, is_active: !editValues.is_active});
                        } else {
                          handleToggleActive(config.id, config.is_active);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {editingId === config.id ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleSave(config.id)}
                          disabled={saving === config.id}
                        >
                          {saving === config.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(config)}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <strong>Off-Hours:</strong> Between 10 PM and 6 AM, rate limits are reduced by the multiplier value. 
                This helps reduce costs during low-priority periods.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIRateLimitConfig;

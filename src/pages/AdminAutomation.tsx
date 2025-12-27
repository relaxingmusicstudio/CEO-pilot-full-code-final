import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Zap,
  Video,
  Image,
  FileText,
  TrendingUp,
  Users,
  Calendar,
  Music,
  Wand2,
  Brain,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Target,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

interface AutomationFunction {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  schedule: string;
  endpoint: string;
  category: 'discovery' | 'generation' | 'management';
}

interface AutomationLog {
  id: string;
  function_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_created: number | null;
  error_message: string | null;
}

const automationFunctions: AutomationFunction[] = [
  {
    id: 'youtube-trend-scraper',
    name: 'YouTube Trend Scraper',
    description: 'Discovers trending HVAC videos and extracts content ideas',
    icon: <TrendingUp className="h-5 w-5" />,
    schedule: 'Every 6 hours',
    endpoint: 'youtube-trend-scraper',
    category: 'discovery'
  },
  {
    id: 'youtube-discover',
    name: 'YouTube Channel Discovery',
    description: 'Finds new HVAC channels and influencers to monitor',
    icon: <Video className="h-5 w-5" />,
    schedule: 'Daily at midnight',
    endpoint: 'youtube-discover',
    category: 'discovery'
  },
  {
    id: 'content-generator',
    name: 'Content Generator',
    description: 'Auto-generates blog posts and social media content from ideas',
    icon: <FileText className="h-5 w-5" />,
    schedule: 'Every 4 hours',
    endpoint: 'content-generator',
    category: 'generation'
  },
  {
    id: 'content-image',
    name: 'Image Generator',
    description: 'Creates marketing images using Nano Banana AI',
    icon: <Image className="h-5 w-5" />,
    schedule: 'Every 4 hours',
    endpoint: 'content-image',
    category: 'generation'
  },
  {
    id: 'did-video',
    name: 'D-ID Video Generator',
    description: 'Creates AI avatar videos for social media',
    icon: <Video className="h-5 w-5" />,
    schedule: 'Daily at 9 AM',
    endpoint: 'did-video',
    category: 'generation'
  },
  {
    id: 'content-calendar-checker',
    name: 'Calendar Checker',
    description: 'Monitors content calendar and creates alerts for gaps',
    icon: <Calendar className="h-5 w-5" />,
    schedule: 'Every 2 hours',
    endpoint: 'content-calendar-checker',
    category: 'management'
  },
  {
    id: 'lead-score-refresher',
    name: 'Lead Score Refresher',
    description: 'Updates lead temperatures and identifies hot leads',
    icon: <Users className="h-5 w-5" />,
    schedule: 'Every hour',
    endpoint: 'lead-score-refresher',
    category: 'management'
  }
];

export default function AdminAutomation() {
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [runningFunctions, setRunningFunctions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch automation logs');
    } else {
      setLogs(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const runFunction = async (func: AutomationFunction) => {
    setRunningFunctions(prev => new Set(prev).add(func.id));
    toast.info(`Starting ${func.name}...`);

    try {
      // Log the start
      const { data: logEntry } = await supabase
        .from('automation_logs')
        .insert({
          function_name: func.id,
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      // Call the edge function
      const { data, error } = await supabase.functions.invoke(func.endpoint, {
        body: { manual_trigger: true }
      });

      if (error) throw error;

      // Update log with success
      if (logEntry) {
        await supabase
          .from('automation_logs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            items_processed: data?.items_processed || 0,
            items_created: data?.items_created || 0
          })
          .eq('id', logEntry.id);
      }

      toast.success(`${func.name} completed successfully!`);
      fetchLogs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.error(`Error running ${func.name}:`, error);
      toast.error(`${func.name} failed: ${message}`);
      
      // Log the error
      await supabase
        .from('automation_logs')
        .insert({
          function_name: func.id,
          status: 'failed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          error_message: message
        });
      
      fetchLogs();
    } finally {
      setRunningFunctions(prev => {
        const next = new Set(prev);
        next.delete(func.id);
        return next;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Running</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryFunctions = (category: AutomationFunction['category']) => 
    automationFunctions.filter(f => f.category === category);

  return (
    <AdminLayout title="Automation Dashboard" subtitle="Test, monitor, and manage automated workflows">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
          </div>
          <Button onClick={fetchLogs} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Logs
          </Button>
        </div>

        <Tabs defaultValue="functions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="functions">Functions</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="audio">Audio & Effects</TabsTrigger>
            <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          </TabsList>

          <TabsContent value="functions" className="space-y-6">
            {/* Content Discovery */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Content Discovery
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {getCategoryFunctions('discovery').map(func => (
                  <FunctionCard 
                    key={func.id} 
                    func={func} 
                    isRunning={runningFunctions.has(func.id)}
                    onRun={() => runFunction(func)}
                    logs={logs.filter(l => l.function_name === func.id).slice(0, 3)}
                  />
                ))}
              </div>
            </div>

            {/* Content Generation */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" />
                Content Generation
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {getCategoryFunctions('generation').map(func => (
                  <FunctionCard 
                    key={func.id} 
                    func={func} 
                    isRunning={runningFunctions.has(func.id)}
                    onRun={() => runFunction(func)}
                    logs={logs.filter(l => l.function_name === func.id).slice(0, 3)}
                  />
                ))}
              </div>
            </div>

            {/* Management */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Workflow Management
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {getCategoryFunctions('management').map(func => (
                  <FunctionCard 
                    key={func.id} 
                    func={func} 
                    isRunning={runningFunctions.has(func.id)}
                    onRun={() => runFunction(func)}
                    logs={logs.filter(l => l.function_name === func.id).slice(0, 3)}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Automation Logs</CardTitle>
                <CardDescription>Recent automation runs and their status</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {isLoading ? (
                      <p className="text-muted-foreground text-center py-8">Loading logs...</p>
                    ) : logs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No automation logs yet. Run a function to see logs here.</p>
                    ) : (
                      logs.map(log => (
                        <div key={log.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                          <div className="space-y-1">
                            <p className="font-medium">{log.function_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(log.started_at), 'MMM d, yyyy h:mm a')}
                            </p>
                            {log.error_message && (
                              <p className="text-sm text-red-400">{log.error_message}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            {log.items_processed !== null && (
                              <div className="text-right text-sm">
                                <p className="text-muted-foreground">Processed: {log.items_processed}</p>
                                <p className="text-muted-foreground">Created: {log.items_created || 0}</p>
                              </div>
                            )}
                            {getStatusBadge(log.status)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audio">
            <AudioEffectsPanel />
          </TabsContent>

          <TabsContent value="intelligence">
            <IntelligencePanel />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function FunctionCard({ 
  func, 
  isRunning, 
  onRun, 
  logs 
}: { 
  func: AutomationFunction; 
  isRunning: boolean; 
  onRun: () => void;
  logs: AutomationLog[];
}) {
  const lastRun = logs[0];
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {func.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{func.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{func.schedule}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{func.description}</p>
        
        {lastRun && (
          <div className="text-xs text-muted-foreground">
            Last run: {format(new Date(lastRun.started_at), 'MMM d, h:mm a')} - 
            <span className={lastRun.status === 'completed' ? ' text-green-400' : lastRun.status === 'failed' ? ' text-red-400' : ''}>
              {' '}{lastRun.status}
            </span>
          </div>
        )}
        
        <Button 
          onClick={onRun} 
          disabled={isRunning}
          className="w-full"
        >
          {isRunning ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Test Function
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function AudioEffectsPanel() {
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [isGeneratingSfx, setIsGeneratingSfx] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState('Upbeat corporate background music for HVAC promotional video');
  const [sfxPrompt, setSfxPrompt] = useState('Air conditioning unit starting up, mechanical hum');
  const [musicAudio, setMusicAudio] = useState<string | null>(null);
  const [sfxAudio, setSfxAudio] = useState<string | null>(null);

  const testMusicGeneration = async () => {
    setIsGeneratingMusic(true);
    toast.info('Generating music... This may take 20-30 seconds.');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, duration: 30 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate music');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      setMusicAudio(audioUrl);
      toast.success('Music generated successfully! Click play to listen.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Music generation error:', msg);
      toast.error(`Failed to generate music: ${msg}`);
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const testSfxGeneration = async () => {
    setIsGeneratingSfx(true);
    toast.info('Generating sound effect... This may take 5-10 seconds.');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-sfx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sfxPrompt, duration: 5 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate SFX');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      setSfxAudio(audioUrl);
      toast.success('Sound effect generated! Click play to listen.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('SFX generation error:', msg);
      toast.error(`Failed to generate SFX: ${msg}`);
    } finally {
      setIsGeneratingSfx(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Background Music
          </CardTitle>
          <CardDescription>
            Generate studio-quality music tracks using ElevenLabs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <p className="text-sm font-medium">How it works:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Text-to-music generation</li>
              <li>• Various genres and moods</li>
              <li>• Up to 60 second tracks</li>
              <li>• Perfect for video backgrounds</li>
            </ul>
          </div>
          
          <textarea
            className="w-full p-3 rounded-lg border bg-background text-sm"
            rows={3}
            value={musicPrompt}
            onChange={(e) => setMusicPrompt(e.target.value)}
            placeholder="Describe the music you want..."
          />

          {musicAudio && (
            <audio controls className="w-full" src={musicAudio}>
              Your browser does not support audio playback.
            </audio>
          )}
          
          <Button onClick={testMusicGeneration} disabled={isGeneratingMusic} className="w-full">
            {isGeneratingMusic ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Music className="h-4 w-4 mr-2" />
                Generate Music
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Sound Effects
          </CardTitle>
          <CardDescription>
            Generate realistic sound effects from text descriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <p className="text-sm font-medium">How it works:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Text-to-SFX generation</li>
              <li>• Up to 22 seconds</li>
              <li>• Realistic environmental sounds</li>
              <li>• Perfect for video enhancement</li>
            </ul>
          </div>
          
          <textarea
            className="w-full p-3 rounded-lg border bg-background text-sm"
            rows={3}
            value={sfxPrompt}
            onChange={(e) => setSfxPrompt(e.target.value)}
            placeholder="Describe the sound effect..."
          />

          {sfxAudio && (
            <audio controls className="w-full" src={sfxAudio}>
              Your browser does not support audio playback.
            </audio>
          )}
          
          <Button onClick={testSfxGeneration} disabled={isGeneratingSfx} className="w-full">
            {isGeneratingSfx ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Generate SFX
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            Video Overlays & Graphics
          </CardTitle>
          <CardDescription>
            Generate overlay images using Nano Banana (already configured!)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg border bg-card">
              <h4 className="font-medium mb-2">Lower Thirds</h4>
              <p className="text-sm text-muted-foreground">Generate text overlays for names, titles, contact info</p>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <h4 className="font-medium mb-2">Call-to-Action Buttons</h4>
              <p className="text-sm text-muted-foreground">Create animated CTA graphics for videos</p>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <h4 className="font-medium mb-2">Logo Animations</h4>
              <p className="text-sm text-muted-foreground">Generate intro/outro logo sequences</p>
            </div>
          </div>
          
          <div className="mt-4 p-4 rounded-lg bg-primary/10">
            <p className="text-sm">
              <strong>Already Available:</strong> The content-image function uses the AI provider configured via GEMINI_API_KEY.
              Image generation requires premium tier - contact support to enable.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ContentPattern {
  id: string;
  content_type: string;
  pattern_type: string;
  pattern_category: string;
  pattern_description: string;
  confidence_score: number;
  times_used: number;
  times_successful: number;
}

interface ContentPerformance {
  id: string;
  content_type: string;
  platform: string | null;
  user_rating: number | null;
  classification: string;
  created_at: string;
  original_prompt: string | null;
}

function IntelligencePanel() {
  const [patterns, setPatterns] = useState<ContentPattern[]>([]);
  const [performances, setPerformances] = useState<ContentPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLearning, setIsLearning] = useState(false);
  const [learningReport, setLearningReport] = useState<string | null>(null);
  
  // Quick rating state
  const [ratingContentType, setRatingContentType] = useState('text');
  const [ratingPrompt, setRatingPrompt] = useState('');
  const [isRating, setIsRating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    
    const [patternsRes, performancesRes] = await Promise.all([
      supabase.from('content_patterns').select('*').order('confidence_score', { ascending: false }).limit(50),
      supabase.from('content_performance').select('*').order('created_at', { ascending: false }).limit(20)
    ]);

    if (patternsRes.data) setPatterns(patternsRes.data);
    if (performancesRes.data) setPerformances(performancesRes.data);
    
    setIsLoading(false);
  };

  const runLearning = async () => {
    setIsLearning(true);
    toast.info('Running content learning analysis...');
    
    try {
      const { data, error } = await supabase.functions.invoke('content-learning', {});
      
      if (error) throw error;
      
      setLearningReport(data.report);
      toast.success(`Learning complete! Updated ${data.patterns_updated} patterns.`);
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Learning failed: ${msg}`);
    } finally {
      setIsLearning(false);
    }
  };

  const rateContent = async (rating: number) => {
    if (!ratingPrompt.trim()) {
      toast.error('Please enter a prompt to rate');
      return;
    }
    
    setIsRating(true);
    try {
      const { error } = await supabase.functions.invoke('rate-content', {
        body: {
          rating,
          content_type: ratingContentType,
          original_prompt: ratingPrompt,
          platform: 'manual'
        }
      });
      
      if (error) throw error;
      
      toast.success(`Rated as ${rating >= 4 ? 'winner' : rating <= 2 ? 'loser' : 'neutral'}!`);
      setRatingPrompt('');
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to rate: ${msg}`);
    } finally {
      setIsRating(false);
    }
  };

  const winnerPatterns = patterns.filter(p => p.pattern_type === 'winner');
  const loserPatterns = patterns.filter(p => p.pattern_type === 'loser');
  const winners = performances.filter(p => p.classification === 'winner');
  const losers = performances.filter(p => p.classification === 'loser');

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <ThumbsUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{winners.length}</p>
                <p className="text-sm text-muted-foreground">Winners</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <ThumbsDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{losers.length}</p>
                <p className="text-sm text-muted-foreground">Losers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{winnerPatterns.length}</p>
                <p className="text-sm text-muted-foreground">Winner Patterns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loserPatterns.length}</p>
                <p className="text-sm text-muted-foreground">Patterns to Avoid</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Rating */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Quick Content Rating
            </CardTitle>
            <CardDescription>
              Rate content to help the AI learn what works
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {['text', 'image', 'video', 'audio'].map(type => (
                <Button
                  key={type}
                  variant={ratingContentType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRatingContentType(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
            
            <textarea
              className="w-full p-3 rounded-lg border bg-background text-sm"
              rows={3}
              value={ratingPrompt}
              onChange={(e) => setRatingPrompt(e.target.value)}
              placeholder="Paste the prompt or content description you want to rate..."
            />
            
            <div className="flex gap-2">
              <Button 
                onClick={() => rateContent(5)} 
                disabled={isRating}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Winner (5)
              </Button>
              <Button 
                onClick={() => rateContent(3)} 
                disabled={isRating}
                variant="outline"
                className="flex-1"
              >
                Neutral (3)
              </Button>
              <Button 
                onClick={() => rateContent(1)} 
                disabled={isRating}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Loser (1)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Run Learning */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Learning
            </CardTitle>
            <CardDescription>
              Analyze patterns and generate strategy report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runLearning} disabled={isLearning} className="w-full">
              {isLearning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Run Learning Analysis
                </>
              )}
            </Button>
            
            {learningReport && (
              <ScrollArea className="h-48 rounded-lg border p-3">
                <pre className="text-sm whitespace-pre-wrap">{learningReport}</pre>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Patterns Display */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Winner Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-500">
              <ThumbsUp className="h-5 w-5" />
              Winner Patterns
            </CardTitle>
            <CardDescription>Patterns that lead to successful content</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              {isLoading ? (
                <p className="text-muted-foreground text-center py-8">Loading...</p>
              ) : winnerPatterns.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No winner patterns yet. Rate some content to start learning!</p>
              ) : (
                <div className="space-y-2">
                  {winnerPatterns.slice(0, 10).map(pattern => (
                    <div key={pattern.id} className="p-3 rounded-lg border bg-green-500/5 border-green-500/20">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="mb-1 text-xs">{pattern.pattern_category}</Badge>
                          <p className="text-sm">{pattern.pattern_description}</p>
                        </div>
                        <Badge className="bg-green-500/20 text-green-400">
                          {Math.round(pattern.confidence_score * 100)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Used {pattern.times_used}x | Won {pattern.times_successful}x
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Loser Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <ThumbsDown className="h-5 w-5" />
              Patterns to Avoid
            </CardTitle>
            <CardDescription>Patterns that lead to poor performance</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              {isLoading ? (
                <p className="text-muted-foreground text-center py-8">Loading...</p>
              ) : loserPatterns.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No loser patterns yet. Rate some content to start learning!</p>
              ) : (
                <div className="space-y-2">
                  {loserPatterns.slice(0, 10).map(pattern => (
                    <div key={pattern.id} className="p-3 rounded-lg border bg-red-500/5 border-red-500/20">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="mb-1 text-xs">{pattern.pattern_category}</Badge>
                          <p className="text-sm">{pattern.pattern_description}</p>
                        </div>
                        <Badge className="bg-red-500/20 text-red-400">
                          Avoid
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Used {pattern.times_used}x | Failed {pattern.times_used - pattern.times_successful}x
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recent Ratings */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Content Performance</CardTitle>
          <CardDescription>Latest rated content and their classifications</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading...</p>
            ) : performances.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No content rated yet.</p>
            ) : (
              <div className="space-y-2">
                {performances.map(perf => (
                  <div key={perf.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{perf.content_type}</Badge>
                        {perf.platform && <Badge variant="secondary">{perf.platform}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                        {perf.original_prompt || 'No prompt recorded'}
                      </p>
                    </div>
                    <Badge className={
                      perf.classification === 'winner' ? 'bg-green-500/20 text-green-400' :
                      perf.classification === 'loser' ? 'bg-red-500/20 text-red-400' :
                      'bg-muted text-muted-foreground'
                    }>
                      {perf.classification}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

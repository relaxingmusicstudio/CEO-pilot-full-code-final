import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Play, Pause, Edit2, Trash2, Clock, Mail, Phone, MessageSquare, ChevronDown, ChevronRight, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessaging, Sequence } from "@/hooks/useMessaging";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AIPersonalization } from "@/components/sequences/AIPersonalization";
import { BehavioralTriggers } from "@/components/sequences/BehavioralTriggers";

interface SequenceStep {
  delay_minutes: number;
  channel: "sms" | "whatsapp" | "email";
  subject?: string;
  content: string;
}

export default function AdminSequences() {
  const navigate = useNavigate();
  const { fetchSequences, createSequence } = useMessaging();
  const { toast } = useToast();
  
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSequence, setNewSequence] = useState({
    name: "",
    description: "",
    trigger_type: "manual",
    steps: [] as SequenceStep[],
  });

  useEffect(() => {
    loadSequences();
  }, []);

  const loadSequences = async () => {
    const data = await fetchSequences();
    setSequences(data);
  };

  const handleToggleActive = async (seq: Sequence) => {
    const { error } = await supabase
      .from("sequences")
      .update({ is_active: !seq.is_active })
      .eq("id", seq.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: seq.is_active ? "Sequence paused" : "Sequence activated" });
      loadSequences();
    }
  };

  const handleDeleteSequence = async (id: string) => {
    if (!confirm("Are you sure you want to delete this sequence?")) return;
    
    const { error } = await supabase.from("sequences").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sequence deleted" });
      loadSequences();
    }
  };

  const addStep = () => {
    setNewSequence({
      ...newSequence,
      steps: [
        ...newSequence.steps,
        { delay_minutes: 0, channel: "sms", content: "" },
      ],
    });
  };

  const updateStep = (index: number, updates: Partial<SequenceStep>) => {
    const steps = [...newSequence.steps];
    steps[index] = { ...steps[index], ...updates };
    setNewSequence({ ...newSequence, steps });
  };

  const removeStep = (index: number) => {
    setNewSequence({
      ...newSequence,
      steps: newSequence.steps.filter((_, i) => i !== index),
    });
  };

  const handleCreateSequence = async () => {
    if (!newSequence.name || newSequence.steps.length === 0) {
      toast({ title: "Please add a name and at least one step", variant: "destructive" });
      return;
    }

    await createSequence({
      name: newSequence.name,
      description: newSequence.description,
      trigger_type: newSequence.trigger_type,
      steps: newSequence.steps,
    });

    setIsCreateOpen(false);
    setNewSequence({ name: "", description: "", trigger_type: "manual", steps: [] });
    loadSequences();
  };

  const formatDelay = (minutes: number) => {
    if (minutes === 0) return "Immediately";
    if (minutes < 0) return `${Math.abs(minutes)} minutes before`;
    if (minutes < 60) return `After ${minutes} minutes`;
    if (minutes < 1440) return `After ${Math.round(minutes / 60)} hours`;
    return `After ${Math.round(minutes / 1440)} days`;
  };

  const channelIcons: Record<string, React.ReactNode> = {
    sms: <Phone className="h-4 w-4" />,
    whatsapp: <MessageSquare className="h-4 w-4 text-green-500" />,
    email: <Mail className="h-4 w-4 text-blue-500" />,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin-analytics")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Automation Sequences</h1>
          <Badge variant="secondary">{sequences.length} sequences</Badge>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Create Sequence
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Automation Sequence</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Sequence Name *</Label>
                <Input
                  value={newSequence.name}
                  onChange={(e) => setNewSequence({ ...newSequence, name: e.target.value })}
                  placeholder="Welcome Sequence"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={newSequence.description}
                  onChange={(e) => setNewSequence({ ...newSequence, description: e.target.value })}
                  placeholder="What does this sequence do?"
                  rows={2}
                />
              </div>
              <div>
                <Label>Trigger</Label>
                <Select
                  value={newSequence.trigger_type}
                  onValueChange={(v) => setNewSequence({ ...newSequence, trigger_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual enrollment</SelectItem>
                    <SelectItem value="lead_created">When lead is created</SelectItem>
                    <SelectItem value="tag_added">When tag is added</SelectItem>
                    <SelectItem value="conversation_started">When conversation starts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Steps</Label>
                  <Button variant="outline" size="sm" onClick={addStep}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Step
                  </Button>
                </div>
                <div className="space-y-4">
                  {newSequence.steps.map((step, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">Step {index + 1}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => removeStep(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Delay (minutes)</Label>
                            <Input
                              type="number"
                              value={step.delay_minutes}
                              onChange={(e) => updateStep(index, { delay_minutes: parseInt(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Channel</Label>
                            <Select
                              value={step.channel}
                              onValueChange={(v) => updateStep(index, { channel: v as "sms" | "whatsapp" | "email" })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sms">SMS</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {step.channel === "email" && (
                          <div>
                            <Label className="text-xs">Subject</Label>
                            <Input
                              value={step.subject || ""}
                              onChange={(e) => updateStep(index, { subject: e.target.value })}
                              placeholder="Email subject"
                            />
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">Message (use {"{{name}}"} for personalization)</Label>
                          <Textarea
                            value={step.content}
                            onChange={(e) => updateStep(index, { content: e.target.value })}
                            placeholder="Hi {{name}}, ..."
                            rows={2}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {newSequence.steps.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      No steps added yet. Click "Add Step" to begin.
                    </p>
                  )}
                </div>
              </div>

              <Button onClick={handleCreateSequence} className="w-full" disabled={!newSequence.name}>
                Create Sequence
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* Content */}
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Tabs defaultValue="sequences" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sequences" className="gap-2"><Clock className="h-4 w-4" /> Sequences</TabsTrigger>
            <TabsTrigger value="personalization" className="gap-2"><Sparkles className="h-4 w-4" /> AI Personalization</TabsTrigger>
            <TabsTrigger value="triggers" className="gap-2"><Zap className="h-4 w-4" /> Behavioral Triggers</TabsTrigger>
          </TabsList>

          <TabsContent value="personalization">
            <AIPersonalization />
          </TabsContent>

          <TabsContent value="triggers">
            <BehavioralTriggers />
          </TabsContent>

          <TabsContent value="sequences">
        {sequences.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No sequences yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create automated message sequences to nurture your leads
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Your First Sequence
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sequences.map((seq) => (
              <Card key={seq.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => setExpandedSequence(expandedSequence === seq.id ? null : seq.id)}
                    >
                      {expandedSequence === seq.id ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <div>
                        <CardTitle className="text-base">{seq.name}</CardTitle>
                        {seq.description && (
                          <CardDescription className="text-sm">{seq.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {seq.is_active ? "Active" : "Paused"}
                        </span>
                        <Switch checked={seq.is_active} onCheckedChange={() => handleToggleActive(seq)} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteSequence(seq.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {seq.trigger_type.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {(seq.steps as SequenceStep[])?.length || 0} steps
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {seq.enrolled_count || 0} enrolled
                    </Badge>
                  </div>
                </CardHeader>
                {expandedSequence === seq.id && (
                  <CardContent className="border-t pt-4">
                    <div className="space-y-3">
                      {(seq.steps as SequenceStep[])?.map((step, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="flex flex-col items-center">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </div>
                            {index < (seq.steps as SequenceStep[]).length - 1 && (
                              <div className="w-px h-8 bg-border my-1" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {channelIcons[step.channel]}
                              <span className="text-sm font-medium capitalize">{step.channel}</span>
                              <span className="text-xs text-muted-foreground">
                                • {formatDelay(step.delay_minutes)}
                              </span>
                            </div>
                            {step.subject && (
                              <p className="text-sm text-muted-foreground">Subject: {step.subject}</p>
                            )}
                            <p className="text-sm">{step.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

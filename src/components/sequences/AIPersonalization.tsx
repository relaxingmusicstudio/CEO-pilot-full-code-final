import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Wand2, Eye, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PersonalizationVariable {
  name: string;
  value: string;
  aiEnhanced: boolean;
}

const mockVariables: PersonalizationVariable[] = [
  { name: "{{first_name}}", value: "John", aiEnhanced: false },
  { name: "{{company}}", value: "Acme Corp", aiEnhanced: false },
  { name: "{{pain_point}}", value: "missed calls after hours", aiEnhanced: true },
  { name: "{{competitor}}", value: "ServiceTitan", aiEnhanced: true },
  { name: "{{industry_insight}}", value: "HVAC companies lose 27% of calls", aiEnhanced: true },
];

export const AIPersonalization = () => {
  const [template, setTemplate] = useState(
    `Hi {{first_name}},

I noticed {{company}} might be dealing with {{pain_point}}.

{{industry_insight}} - and I think we can help you capture those lost opportunities.

Unlike {{competitor}}, our AI actually answers calls in under 3 rings, 24/7.

Would you have 15 minutes this week to see how it works?`
  );
  
  const [preview, setPreview] = useState("");
  const [aiTone, setAiTone] = useState<"professional" | "casual" | "urgent">("professional");
  const [useAIEnhancement, setUseAIEnhancement] = useState(true);

  const generatePreview = () => {
    let result = template;
    mockVariables.forEach(v => {
      result = result.replace(new RegExp(v.name.replace(/[{}]/g, '\\$&'), 'g'), v.value);
    });
    setPreview(result);
    toast.success("Preview generated");
  };

  const enhanceWithAI = () => {
    toast.success("AI enhancement applied");
    setTemplate(prev => prev + "\n\nP.S. I saw your team won the Best HVAC Contractor award last month - congrats!");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Personalization Engine
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="ai-enhance" className="text-sm">AI Enhancement</Label>
            <Switch 
              id="ai-enhance" 
              checked={useAIEnhancement}
              onCheckedChange={setUseAIEnhancement}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Message Template</Label>
            <Textarea 
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {mockVariables.map(v => (
                <Badge 
                  key={v.name} 
                  variant={v.aiEnhanced ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setTemplate(prev => prev + ` ${v.name}`)}
                >
                  {v.aiEnhanced && <Sparkles className="h-3 w-3 mr-1" />}
                  {v.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Live Preview</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={generatePreview}>
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(preview || template);
                  toast.success("Copied!");
                }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg min-h-[280px] text-sm whitespace-pre-wrap">
              {preview || "Click Preview to see personalized message"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <span className="text-sm text-muted-foreground">AI Tone:</span>
          {(["professional", "casual", "urgent"] as const).map(tone => (
            <Badge
              key={tone}
              variant={aiTone === tone ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setAiTone(tone)}
            >
              {tone}
            </Badge>
          ))}
          <div className="flex-1" />
          <Button onClick={enhanceWithAI} className="gap-2">
            <Wand2 className="h-4 w-4" />
            Enhance with AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

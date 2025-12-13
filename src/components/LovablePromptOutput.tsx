import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface LovablePromptOutputProps {
  prompt: string;
  title?: string;
  description?: string;
}

const LovablePromptOutput = ({ prompt, title, description }: LovablePromptOutputProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copied! Paste it into Lovable to implement.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {title || "Lovable-Ready Prompt"}
          <Badge variant="outline" className="ml-auto text-xs bg-primary/10 text-primary border-primary/30">
            Ready to Implement
          </Badge>
        </CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <div className="relative">
          <pre className="bg-background border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            <code>{prompt}</code>
          </pre>
          <Button
            size="sm"
            variant={copied ? "default" : "secondary"}
            className="absolute top-2 right-2 h-7 text-xs gap-1"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          <span>Paste this prompt into Lovable chat to implement the changes</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default LovablePromptOutput;

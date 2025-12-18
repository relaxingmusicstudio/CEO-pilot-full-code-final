/**
 * IssuePanel - Human-in-the-Loop Escape Hatch
 * Shows blockers and guides user through manual fixes
 */

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Copy, ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export interface BlockerItem {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  humanAction: {
    instruction: string;
    location: string;
    copyableValue?: string;
    externalUrl?: string;
  };
  toolId?: string;
  completed?: boolean;
}

interface IssuePanelProps {
  blockers: BlockerItem[];
  onRerun?: (toolId: string) => void;
  onMarkComplete?: (blockerId: string, completed: boolean) => void;
}

export function IssuePanel({ blockers, onRerun, onMarkComplete }: IssuePanelProps) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  if (blockers.length === 0) return null;

  const handleToggleComplete = (id: string, checked: boolean) => {
    const newCompleted = new Set(completedItems);
    if (checked) {
      newCompleted.add(id);
    } else {
      newCompleted.delete(id);
    }
    setCompletedItems(newCompleted);
    onMarkComplete?.(id, checked);
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  const criticalCount = blockers.filter(b => b.severity === "critical").length;
  const warningCount = blockers.filter(b => b.severity === "warning").length;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Human Action Required
          {criticalCount > 0 && (
            <span className="ml-2 text-sm font-normal">
              ({criticalCount} critical, {warningCount} warnings)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {blockers.map((blocker) => {
          const isCompleted = completedItems.has(blocker.id);
          
          return (
            <Alert 
              key={blocker.id}
              variant={blocker.severity === "critical" ? "destructive" : "default"}
              className={isCompleted ? "opacity-50" : ""}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={(checked) => handleToggleComplete(blocker.id, !!checked)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-2">
                  <AlertTitle className={isCompleted ? "line-through" : ""}>
                    {blocker.title}
                  </AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p className="text-sm">{blocker.description}</p>
                    
                    <div className="p-3 bg-muted rounded-md space-y-2">
                      <p className="text-sm font-medium">{blocker.humanAction.instruction}</p>
                      <p className="text-xs text-muted-foreground">
                        📍 Location: {blocker.humanAction.location}
                      </p>
                      
                      {blocker.humanAction.copyableValue && (
                        <div className="flex items-center gap-2 mt-2">
                          <code className="flex-1 text-xs bg-background p-2 rounded border overflow-x-auto">
                            {blocker.humanAction.copyableValue.substring(0, 100)}
                            {blocker.humanAction.copyableValue.length > 100 && "..."}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(blocker.humanAction.copyableValue!)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2">
                        {blocker.humanAction.externalUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(blocker.humanAction.externalUrl, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Open in Dashboard
                          </Button>
                        )}
                        
                        {blocker.toolId && onRerun && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onRerun(blocker.toolId!)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Re-run Check
                          </Button>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </div>
                {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              </div>
            </Alert>
          );
        })}
        
        <p className="text-xs text-muted-foreground">
          ✅ Check the box when you've completed each action, then re-run the relevant tool to verify.
        </p>
      </CardContent>
    </Card>
  );
}

export default IssuePanel;

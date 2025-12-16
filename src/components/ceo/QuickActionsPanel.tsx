import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Zap, 
  CheckCircle2, 
  Target, 
  BarChart3,
  Users,
  FileText,
  Settings,
  Phone
} from "lucide-react";

interface QuickAction {
  label: string;
  icon: React.ElementType;
  path: string;
  variant?: "default" | "outline" | "secondary";
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Hot Leads", icon: Zap, path: "/app/command-center/crm?filter=hot", variant: "default" },
  { label: "Approve Content", icon: CheckCircle2, path: "/app/command-center/approvals", variant: "outline" },
  { label: "Pipeline", icon: Target, path: "/app/command-center/pipeline", variant: "outline" },
  { label: "Analytics", icon: BarChart3, path: "/app/command-center/analytics", variant: "outline" },
];

const SECONDARY_ACTIONS: QuickAction[] = [
  { label: "CRM", icon: Users, path: "/app/command-center/crm" },
  { label: "Content", icon: FileText, path: "/app/command-center/content" },
  { label: "Dialer", icon: Phone, path: "/app/command-center/sequences" },
  { label: "Settings", icon: Settings, path: "/app/command-center/settings" },
];

export function QuickActionsPanel() {
  const navigate = useNavigate();

  const handleAction = (action: QuickAction) => {
    navigate(action.path);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary Actions */}
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant={action.variant || "outline"}
              size="sm"
              className="justify-start h-auto py-2"
              onClick={() => handleAction(action)}
            >
              <action.icon className="h-4 w-4 mr-2" />
              <span className="text-xs">{action.label}</span>
            </Button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">Navigate to</p>
          <div className="grid grid-cols-4 gap-1">
            {SECONDARY_ACTIONS.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                size="sm"
                className="flex-col h-auto py-2 px-1"
                onClick={() => handleAction(action)}
              >
                <action.icon className="h-4 w-4 mb-1" />
                <span className="text-[10px]">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

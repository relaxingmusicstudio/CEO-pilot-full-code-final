/**
 * Feature Flags - Toggle experimental features and debug modes
 * Stores flags in localStorage (safe, client-side only)
 * Future: Optional DB table for server-side persistence
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Flag, Copy, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PlatformStatusBanner } from "@/components/platform/PlatformStatusBanner";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: "debug" | "experimental" | "performance" | "ui";
  defaultValue: boolean;
  warning?: string;
}

const FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: "enableDebugTools",
    name: "Debug Tools",
    description: "Show additional debug information in UI components",
    category: "debug",
    defaultValue: false,
  },
  {
    id: "enableVerboseLogging",
    name: "Verbose Logging",
    description: "Log detailed information to browser console",
    category: "debug",
    defaultValue: false,
  },
  {
    id: "enableCeoAgentOnboarding",
    name: "CEO Agent Onboarding",
    description: "Enable the new AI-powered onboarding flow",
    category: "experimental",
    defaultValue: false,
    warning: "Experimental feature - may not work as expected",
  },
  {
    id: "enableEdgeFunctionCache",
    name: "Edge Function Caching",
    description: "Cache edge function responses for faster repeated calls",
    category: "performance",
    defaultValue: false,
  },
  {
    id: "enableNewDashboardUI",
    name: "New Dashboard UI",
    description: "Use the redesigned dashboard layout",
    category: "ui",
    defaultValue: false,
  },
  {
    id: "enablePlatformToolsInNav",
    name: "Platform Tools in Nav",
    description: "Show Platform Tools link in main navigation",
    category: "ui",
    defaultValue: true,
  },
  {
    id: "enableBundleAutoDownload",
    name: "Auto-download Support Bundle",
    description: "Automatically download support bundle on errors",
    category: "debug",
    defaultValue: false,
  },
];

const STORAGE_KEY = "platform_feature_flags";

function getStoredFlags(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setStoredFlags(flags: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
}

function getFeatureFlag(id: string): boolean {
  const flags = getStoredFlags();
  const definition = FEATURE_FLAGS.find(f => f.id === id);
  return flags[id] ?? definition?.defaultValue ?? false;
}

export default function FeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    const stored = getStoredFlags();
    const initialFlags: Record<string, boolean> = {};
    FEATURE_FLAGS.forEach(f => {
      initialFlags[f.id] = stored[f.id] ?? f.defaultValue;
    });
    setFlags(initialFlags);
  }, []);

  const handleToggle = (id: string, value: boolean) => {
    const newFlags = { ...flags, [id]: value };
    setFlags(newFlags);
    setStoredFlags(newFlags);
    toast.success(`${id} ${value ? "enabled" : "disabled"}`);
  };

  const handleResetAll = () => {
    const defaultFlags: Record<string, boolean> = {};
    FEATURE_FLAGS.forEach(f => {
      defaultFlags[f.id] = f.defaultValue;
    });
    setFlags(defaultFlags);
    setStoredFlags(defaultFlags);
    toast.success("All flags reset to defaults");
  };

  const handleCopyFlags = () => {
    navigator.clipboard.writeText(JSON.stringify(flags, null, 2));
    toast.success("Flags copied to clipboard");
  };

  const enabledCount = Object.values(flags).filter(Boolean).length;
  
  const getByCategory = (category: FeatureFlag["category"]) => 
    FEATURE_FLAGS.filter(f => f.category === category);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <PlatformStatusBanner />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-6 w-6" />
                Feature Flags
              </CardTitle>
              <CardDescription>
                Toggle experimental features and debug modes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyFlags}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Flags
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetAll}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg mb-6">
            <Badge variant={enabledCount > 0 ? "default" : "secondary"}>
              {enabledCount} enabled
            </Badge>
            <span className="text-sm text-muted-foreground">
              {FEATURE_FLAGS.length} total flags
            </span>
          </div>

          {(["debug", "experimental", "performance", "ui"] as const).map(category => {
            const categoryFlags = getByCategory(category);
            if (categoryFlags.length === 0) return null;
            
            return (
              <div key={category} className="mb-6">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 capitalize">
                  {category}
                </h3>
                <div className="space-y-4">
                  {categoryFlags.map(flag => (
                    <div 
                      key={flag.id}
                      className="flex items-start justify-between p-4 rounded-lg border"
                    >
                      <div className="space-y-1 flex-1 mr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{flag.name}</span>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {flag.id}
                          </code>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {flag.description}
                        </p>
                        {flag.warning && flags[flag.id] && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            {flag.warning}
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={flags[flag.id] ?? flag.defaultValue}
                        onCheckedChange={(checked) => handleToggle(flag.id, checked)}
                      />
                    </div>
                  ))}
                </div>
                <Separator className="my-6" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>About Feature Flags</AlertTitle>
        <AlertDescription className="text-sm">
          Feature flags are stored in your browser's localStorage. They persist across sessions 
          but are not synced to server. Future enhancement: DB-backed flags for team-wide settings.
        </AlertDescription>
      </Alert>
    </div>
  );
}

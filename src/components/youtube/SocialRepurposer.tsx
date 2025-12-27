import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Scissors,
  Instagram,
  Twitter,
  Linkedin,
  Facebook,
  Play,
  Clock,
  Sparkles,
  Download,
  Share2,
  Check,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

interface VideoClip {
  id: string;
  videoId: string;
  videoTitle: string;
  startTime: string;
  endTime: string;
  duration: string;
  suggestedCaption: string;
  hookScore: number;
  platforms: string[];
  status: "pending" | "generated" | "posted";
}

interface SocialRepurposerProps {
  clips: VideoClip[];
  onGenerateClips?: (videoId: string) => void;
  onPostClip?: (clipId: string, platforms: string[]) => void;
}

const platformIcons: Record<string, LucideIcon> = {
  instagram: Instagram,
  tiktok: Play,
  twitter: Twitter,
  linkedin: Linkedin,
  facebook: Facebook,
};

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-500",
  tiktok: "bg-foreground/20 text-foreground",
  twitter: "bg-blue-400/20 text-blue-400",
  linkedin: "bg-blue-600/20 text-blue-600",
  facebook: "bg-blue-500/20 text-blue-500",
};

export function SocialRepurposer({
  clips,
  onGenerateClips,
  onPostClip,
}: SocialRepurposerProps) {
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "instagram",
    "tiktok",
  ]);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const handleSelectClip = (clipId: string) => {
    setSelectedClips((prev) =>
      prev.includes(clipId)
        ? prev.filter((id) => id !== clipId)
        : [...prev, clipId]
    );
  };

  const handleTogglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleBulkGenerate = async () => {
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setGenerating(false);
    toast({
      title: "Clips Generated",
      description: `Generated ${selectedClips.length} clips for ${selectedPlatforms.length} platforms`,
    });
  };

  const handleSchedule = () => {
    toast({
      title: "Clips Scheduled",
      description: "Content added to your social calendar",
    });
  };

  return (
    <div className="space-y-4">
      {/* Platform Selector */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Target Platforms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.keys(platformIcons).map((platform) => {
              const Icon = platformIcons[platform];
              const isSelected = selectedPlatforms.includes(platform);
              return (
                <Button
                  key={platform}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTogglePlatform(platform)}
                  className="capitalize"
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {platform}
                  {isSelected && <Check className="h-3 w-3 ml-1" />}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Detected Clips */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scissors className="h-4 w-4 text-accent" />
              AI-Detected Clip Opportunities
              <Badge variant="secondary">{clips.length} clips</Badge>
            </CardTitle>
            <div className="flex gap-2">
              {selectedClips.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkGenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Generate ({selectedClips.length})
                  </Button>
                  <Button size="sm" onClick={handleSchedule}>
                    Schedule All
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {clips.map((clip) => (
              <div
                key={clip.id}
                className={`p-4 hover:bg-muted/50 transition-colors ${
                  selectedClips.includes(clip.id) ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedClips.includes(clip.id)}
                    onCheckedChange={() => handleSelectClip(clip.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={clip.hookScore >= 85 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {clip.hookScore}% hook
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {clip.startTime} - {clip.endTime} ({clip.duration})
                      </span>
                      <Badge
                        variant={
                          clip.status === "posted"
                            ? "default"
                            : clip.status === "generated"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {clip.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mb-1">
                      From: {clip.videoTitle}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      "{clip.suggestedCaption}"
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">
                        Best for:
                      </span>
                      {clip.platforms.map((platform) => {
                        const Icon = platformIcons[platform];
                        return (
                          <span
                            key={platform}
                            className={`p-1 rounded ${platformColors[platform]}`}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-primary">{clips.length}</p>
            <p className="text-xs text-muted-foreground">Clips Detected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {clips.filter((c) => c.status === "posted").length}
            </p>
            <p className="text-xs text-muted-foreground">Posted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-accent">
              {clips.filter((c) => c.status === "pending").length}
            </p>
            <p className="text-xs text-muted-foreground">Ready to Post</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

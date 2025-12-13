import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Youtube } from "lucide-react";

export interface YouTubeChannel {
  id: string;
  name: string;
  handle: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  isConnected: boolean;
  thumbnail?: string;
}

interface ChannelSelectorProps {
  channels: YouTubeChannel[];
  selectedChannel: string;
  onChannelChange: (channelId: string) => void;
  onAddChannel?: () => void;
}

export function ChannelSelector({
  channels,
  selectedChannel,
  onChannelChange,
  onAddChannel,
}: ChannelSelectorProps) {
  const selected = channels.find((c) => c.id === selectedChannel);

  return (
    <div className="flex items-center gap-3">
      <Select value={selectedChannel} onValueChange={onChannelChange}>
        <SelectTrigger className="w-[280px]">
          <SelectValue>
            {selected && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center">
                  <Youtube className="h-3 w-3 text-destructive" />
                </div>
                <span className="font-medium">{selected.name}</span>
                <Badge variant="secondary" className="text-xs ml-1">
                  {formatNumber(selected.subscribers)} subs
                </Badge>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {channels.map((channel) => (
            <SelectItem key={channel.id} value={channel.id}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center">
                  <Youtube className="h-3 w-3 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">{channel.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {channel.handle} • {formatNumber(channel.subscribers)} subs
                  </p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onAddChannel && (
        <Button variant="outline" size="sm" onClick={onAddChannel}>
          <Plus className="h-4 w-4 mr-1" />
          Add Channel
        </Button>
      )}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

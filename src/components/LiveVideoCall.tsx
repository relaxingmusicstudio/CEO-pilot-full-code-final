import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Video, VideoOff, Mic, MicOff, Phone, MessageSquare, Maximize2, Volume2 } from "lucide-react";

interface LiveVideoCallProps {
  isOpen: boolean;
  onClose: () => void;
}

const LiveVideoCall = ({ isOpen, onClose }: LiveVideoCallProps) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (isOpen && isConnecting) {
      const timer = setTimeout(() => {
        setIsConnecting(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isConnecting]);

  useEffect(() => {
    if (isOpen && !isConnecting) {
      const interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, isConnecting]);

  useEffect(() => {
    if (!isOpen) {
      setIsConnecting(true);
      setCallDuration(0);
    }
  }, [isOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/95 backdrop-blur-md animate-fade-in">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
            <span className="text-primary-foreground font-medium">
              {isConnecting ? "Connecting to AI Sales Advisor..." : `Live Call • ${formatTime(callDuration)}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
          >
            <X className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>

        {/* Main Video Area */}
        <div className="flex-1 relative flex items-center justify-center p-4">
          {isConnecting ? (
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-accent/20 flex items-center justify-center animate-pulse">
                <Video className="w-16 h-16 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-primary-foreground mb-2">
                Connecting to Your AI Advisor...
              </h2>
              <p className="text-primary-foreground/70">
                Please wait while we connect you with Sarah, your AI sales specialist.
              </p>
              <div className="flex justify-center gap-2 mt-6">
                <div className="w-3 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                <div className="w-3 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-3 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          ) : (
            <>
              {/* AI Avatar Video (Main) */}
              <div className="relative w-full max-w-4xl aspect-video bg-gradient-to-br from-primary to-primary/80 rounded-2xl overflow-hidden shadow-2xl">
                {/* Avatar Placeholder - Replace with HeyGen embed */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-40 h-40 mx-auto mb-4 rounded-full bg-accent/30 flex items-center justify-center border-4 border-accent/50">
                      <div className="text-7xl">👩‍💼</div>
                    </div>
                    <h3 className="text-2xl font-bold text-primary-foreground mb-1">Sarah</h3>
                    <p className="text-primary-foreground/70">AI Sales Advisor</p>
                  </div>
                </div>

                {/* Speaking Indicator */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-primary/80 rounded-full px-4 py-2">
                  <Volume2 className="w-4 h-4 text-accent animate-pulse" />
                  <span className="text-primary-foreground text-sm">Speaking...</span>
                </div>

                {/* HeyGen Integration Note */}
                <div className="absolute top-4 right-4 bg-accent/90 text-accent-foreground px-3 py-1.5 rounded-full text-xs font-medium">
                  Powered by HeyGen
                </div>

                {/* Live Indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 rounded-full px-3 py-1.5">
                  <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
                  <span className="text-primary-foreground text-xs font-medium">LIVE</span>
                </div>
              </div>

              {/* User Video (Picture-in-Picture) */}
              <div className="absolute bottom-24 right-8 w-48 h-36 bg-muted rounded-xl overflow-hidden shadow-xl border-2 border-border">
                {isVideoOn ? (
                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                    <div className="text-4xl">👤</div>
                  </div>
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <VideoOff className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 text-xs text-foreground font-medium bg-background/80 px-2 py-1 rounded">
                  You
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chat Sidebar Hint */}
        {!isConnecting && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <button className="w-12 h-12 rounded-full bg-primary/40 flex items-center justify-center hover:bg-primary/60 transition-colors">
              <MessageSquare className="w-6 h-6 text-primary-foreground" />
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="p-6 bg-primary/20">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isMuted ? "bg-destructive" : "bg-primary-foreground/20 hover:bg-primary-foreground/30"
              }`}
            >
              {isMuted ? (
                <MicOff className="w-6 h-6 text-primary-foreground" />
              ) : (
                <Mic className="w-6 h-6 text-primary-foreground" />
              )}
            </button>

            <button
              onClick={() => setIsVideoOn(!isVideoOn)}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                !isVideoOn ? "bg-destructive" : "bg-primary-foreground/20 hover:bg-primary-foreground/30"
              }`}
            >
              {isVideoOn ? (
                <Video className="w-6 h-6 text-primary-foreground" />
              ) : (
                <VideoOff className="w-6 h-6 text-primary-foreground" />
              )}
            </button>

            <button
              onClick={onClose}
              className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-all shadow-lg hover:scale-105"
            >
              <Phone className="w-7 h-7 text-primary-foreground rotate-[135deg]" />
            </button>

            <button className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center hover:bg-primary-foreground/30 transition-all">
              <Maximize2 className="w-6 h-6 text-primary-foreground" />
            </button>
          </div>

          {!isConnecting && (
            <p className="text-center text-primary-foreground/60 text-sm mt-4">
              Ask Sarah anything about our AI dispatcher service for HVAC companies. She's ready to help!
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveVideoCall;

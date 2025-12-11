import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react";
import Vapi from "@vapi-ai/web";
import { useToast } from "@/hooks/use-toast";

interface VapiVoiceDemoProps {
  isOpen: boolean;
  onClose: () => void;
}

// Your Vapi assistant ID - replace with your actual assistant ID
const VAPI_ASSISTANT_ID = "YOUR_VAPI_ASSISTANT_ID";

const VapiVoiceDemo = ({ isOpen, onClose }: VapiVoiceDemoProps) => {
  const { toast } = useToast();
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [callDuration, setCallDuration] = useState(0);

  // Initialize Vapi
  useEffect(() => {
    if (isOpen && !vapi) {
      const vapiInstance = new Vapi("public-key-placeholder"); // Public key not needed for web calls
      setVapi(vapiInstance);

      vapiInstance.on("call-start", () => {
        console.log("Vapi call started");
        setIsConnected(true);
        setIsConnecting(false);
      });

      vapiInstance.on("call-end", () => {
        console.log("Vapi call ended");
        setIsConnected(false);
        setIsConnecting(false);
        setCallDuration(0);
      });

      vapiInstance.on("speech-start", () => {
        setIsSpeaking(true);
      });

      vapiInstance.on("speech-end", () => {
        setIsSpeaking(false);
      });

      vapiInstance.on("message", (message) => {
        console.log("Vapi message:", message);
        if (message.type === "transcript" && message.transcript) {
          setTranscript((prev) => [...prev, `${message.role}: ${message.transcript}`]);
        }
      });

      vapiInstance.on("error", (error) => {
        console.error("Vapi error:", error);
        toast({
          title: "Connection Error",
          description: "Failed to connect to the AI agent. Please try again.",
          variant: "destructive",
        });
        setIsConnecting(false);
      });
    }

    return () => {
      if (vapi) {
        vapi.stop();
      }
    };
  }, [isOpen, toast]);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startCall = useCallback(async () => {
    if (!vapi) return;

    setIsConnecting(true);
    setTranscript([]);

    try {
      await vapi.start(VAPI_ASSISTANT_ID);
    } catch (error) {
      console.error("Failed to start Vapi call:", error);
      toast({
        title: "Connection Failed",
        description: "Could not connect to the AI agent. Please check your configuration.",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  }, [vapi, toast]);

  const endCall = useCallback(() => {
    if (vapi) {
      vapi.stop();
    }
  }, [vapi]);

  const toggleMute = useCallback(() => {
    if (vapi) {
      vapi.setMuted(!isMuted);
      setIsMuted(!isMuted);
    }
  }, [vapi, isMuted]);

  const handleClose = () => {
    if (vapi) {
      vapi.stop();
    }
    setIsConnected(false);
    setIsConnecting(false);
    setTranscript([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/90 backdrop-blur-md animate-fade-in flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
            )}
            <span className="text-primary-foreground font-medium">
              {isConnecting ? "Connecting..." : isConnected ? `Live Demo • ${formatTime(callDuration)}` : "AI Voice Demo"}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Main Content */}
        <div className="p-6">
          {!isConnected && !isConnecting ? (
            // Start Screen
            <div className="text-center py-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-accent/20 flex items-center justify-center">
                <Phone className="w-12 h-12 text-accent" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Talk to Our AI Demo Agent
              </h3>
              <p className="text-muted-foreground mb-6">
                Experience how our AI handles calls - ask about our services, pricing, or schedule a demo.
              </p>
              <Button variant="hero" size="xl" onClick={startCall} className="w-full">
                <Phone className="w-5 h-5" />
                START VOICE DEMO
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                🎤 Make sure your microphone is enabled
              </p>
            </div>
          ) : isConnecting ? (
            // Connecting Screen
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-accent/20 flex items-center justify-center animate-pulse">
                <Phone className="w-10 h-10 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Connecting to AI Agent...
              </h3>
              <div className="flex justify-center gap-2 mt-4">
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          ) : (
            // Active Call Screen
            <div className="space-y-4">
              {/* AI Avatar */}
              <div className="flex items-center justify-center">
                <div className={`w-24 h-24 rounded-full bg-primary flex items-center justify-center transition-all ${isSpeaking ? "ring-4 ring-accent ring-opacity-50 scale-105" : ""}`}>
                  <div className="text-4xl">🤖</div>
                </div>
              </div>

              {/* Speaking Indicator */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Volume2 className={`w-4 h-4 ${isSpeaking ? "text-accent animate-pulse" : "text-muted-foreground"}`} />
                  <span className="text-sm text-muted-foreground">
                    {isSpeaking ? "AI is speaking..." : "Listening..."}
                  </span>
                </div>
              </div>

              {/* Transcript */}
              {transcript.length > 0 && (
                <div className="bg-secondary rounded-lg p-4 max-h-40 overflow-y-auto">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Transcript</h4>
                  {transcript.slice(-5).map((line, i) => (
                    <p key={i} className="text-sm text-foreground">{line}</p>
                  ))}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                    isMuted ? "bg-destructive" : "bg-secondary hover:bg-secondary/80"
                  }`}
                >
                  {isMuted ? (
                    <MicOff className="w-6 h-6 text-primary-foreground" />
                  ) : (
                    <Mic className="w-6 h-6 text-foreground" />
                  )}
                </button>

                <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-all shadow-lg"
                >
                  <PhoneOff className="w-7 h-7 text-primary-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VapiVoiceDemo;

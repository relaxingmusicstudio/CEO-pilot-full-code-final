import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Video, Phone, BarChart3 } from "lucide-react";
import LiveVideoCall from "./LiveVideoCall";
import { ElevenLabsVoiceDemo } from "./ElevenLabsVoiceDemo";
import { useVisitor } from "@/contexts/useVisitor";

const HeroSection = () => {
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const [isVoiceDemoOpen, setIsVoiceDemoOpen] = useState(false);
  const { trackCtaClick } = useVisitor();

  const scrollToSection = (id: string) => {
    trackCtaClick(`hero-scroll-${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleVideoCallOpen = () => {
    trackCtaClick("hero-video-call-cta");
    setIsVideoCallOpen(true);
  };

  const handleVoiceDemoOpen = () => {
    trackCtaClick("hero-voice-demo-cta");
    setIsVoiceDemoOpen(true);
  };

  return (
    <>
      <section className="relative min-h-screen hero-gradient overflow-hidden pt-20">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>

        <div className="container relative z-10 flex flex-col lg:flex-row items-center justify-between min-h-[calc(100vh-5rem)] py-12 gap-12">
          {/* Left Content */}
          <div className="flex-1 text-center lg:text-left animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight mb-6">
              Stop Losing{" "}
              <span className="text-accent">$156B Industry Revenue</span>
              <br />
              to Missed Calls.
            </h1>
            
            <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mb-8">
              HVAC contractors miss 27% of incoming calls. 80% of those callers hang up on voicemail and call your competitor. Our AI answers every call in under 3 rings, 24/7.
              <span className="font-semibold text-primary-foreground"> Done-for-you in 48 hours. No contracts.</span>
            </p>

            <div className="flex flex-col gap-4 justify-center lg:justify-start max-w-md mx-auto lg:mx-0">
              {/* Primary CTA - Live Video Call */}
              <Button 
                variant="hero" 
                size="xl" 
                onClick={handleVideoCallOpen}
                className="w-full group"
              >
                <Video className="w-6 h-6" />
                <span>TALK TO AN AI ADVISOR NOW</span>
              </Button>
              
              {/* Secondary CTA - Voice Demo (Vapi) */}
              <Button 
                variant="heroSecondary" 
                size="xl"
                onClick={handleVoiceDemoOpen}
                className="w-full"
              >
                <Phone className="w-5 h-5" />
                TALK TO A DEMO AI AGENT
              </Button>
            </div>

            {/* Tertiary CTA */}
            <div className="mt-4 flex justify-center lg:justify-start">
              <Button 
                variant="ghost" 
                size="lg"
                onClick={() => scrollToSection("pricing")}
                className="text-primary-foreground/70 hover:text-accent"
              >
                <BarChart3 className="w-5 h-5" />
                See Plans from $497/mo
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap gap-6 mt-10 justify-center lg:justify-start text-primary-foreground/70 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <span>No contracts required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <span>48-hour setup</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <span>30-day ROI guarantee</span>
              </div>
            </div>
          </div>

          {/* Right Content - AI Avatar with Video Call Preview */}
          <div className="flex-1 flex justify-center lg:justify-end animate-float">
            <div className="relative">
              {/* Video Call Preview Card */}
              <div 
                onClick={handleVideoCallOpen}
                className="w-80 md:w-96 bg-gradient-to-br from-primary-foreground/10 to-accent/20 rounded-2xl p-1 shadow-2xl cursor-pointer group hover:scale-105 transition-all duration-300"
              >
                <div className="bg-primary rounded-xl overflow-hidden">
                  {/* Video Preview Header */}
                  <div className="flex items-center justify-between p-3 border-b border-primary-foreground/10">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
                      <span className="text-primary-foreground text-sm font-medium">Live Sales Call</span>
                    </div>
                    <span className="text-primary-foreground/60 text-xs">Click to Start</span>
                  </div>

                  {/* Avatar Preview */}
                  <div className="relative aspect-video bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 mx-auto mb-3 rounded-full bg-accent/30 flex items-center justify-center border-4 border-accent/50 group-hover:border-accent transition-all">
                        <div className="text-5xl">👩‍💼</div>
                      </div>
                      <h3 className="text-lg font-bold text-primary-foreground">Sarah</h3>
                      <p className="text-primary-foreground/70 text-sm">AI Sales Advisor</p>
                    </div>

                    {/* Play Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/40 opacity-0 group-hover:opacity-100 transition-all">
                      <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center shadow-xl">
                        <Video className="w-8 h-8 text-accent-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar */}
                  <div className="p-3 bg-primary/80">
                    <p className="text-primary-foreground/80 text-sm text-center">
                      "Ready to show you how we recover your missed calls!"
                    </p>
                  </div>
                </div>
              </div>

              {/* Speech Bubble */}
              <div className="absolute -bottom-4 -left-8 md:-left-16 max-w-xs bg-card rounded-2xl p-4 shadow-xl animate-bounce-subtle">
                <div className="absolute -top-2 right-8 w-4 h-4 bg-card transform rotate-45" />
                <p className="text-foreground text-sm md:text-base font-medium leading-relaxed">
                  "Hi! I'm Sarah. Let's hop on a quick <span className="text-accent font-bold">live video call</span> and I'll show you exactly how our AI handles your HVAC calls."
                </p>
              </div>

              {/* Decorative Elements */}
              <div className="absolute top-0 -right-4 w-16 h-16 bg-accent/30 rounded-full blur-xl" />
              <div className="absolute -bottom-8 right-8 w-12 h-12 bg-primary-foreground/20 rounded-full blur-lg" />
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-primary-foreground/50 rounded-full flex justify-center">
            <div className="w-1.5 h-3 bg-primary-foreground/50 rounded-full mt-2 animate-pulse" />
          </div>
        </div>
      </section>

      {/* Live Video Call Modal */}
      <LiveVideoCall isOpen={isVideoCallOpen} onClose={() => setIsVideoCallOpen(false)} />
      
      {/* ElevenLabs Voice Demo Modal */}
      <ElevenLabsVoiceDemo 
        isOpen={isVoiceDemoOpen} 
        onClose={() => setIsVoiceDemoOpen(false)} 
        agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID}
      />
    </>
  );
};

export default HeroSection;

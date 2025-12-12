import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, CheckCircle, Clock, Search, Bot, Phone, DollarSign } from "lucide-react";
import LiveVideoCall from "@/components/LiveVideoCall";

const transcriptData = [
  {
    time: 0,
    speaker: "Customer",
    text: "Hi, my AC just stopped working completely. It's 95 degrees and I have elderly parents visiting.",
    emotion: "urgent"
  },
  {
    time: 4,
    speaker: "AI",
    text: "I completely understand the urgency - that's a serious situation with elderly family members. I'm dispatching our nearest HVAC technician to you right now. Can I get your address?",
    action: "empathy"
  },
  {
    time: 10,
    speaker: "Customer",
    text: "It's 742 Oak Street. How soon can someone get here? My parents can't handle this heat.",
    emotion: "worried"
  },
  {
    time: 14,
    speaker: "AI",
    text: "I have a technician 12 minutes away who's completing another call. For emergency situations like yours, we have a $149 diagnostic fee that gets waived if you proceed with repairs. Does that work for you?",
    action: "booking"
  },
  {
    time: 22,
    speaker: "Customer",
    text: "Yes, absolutely. Please send them as fast as possible.",
    emotion: "relieved"
  },
  {
    time: 26,
    speaker: "AI",
    text: "Done - Mike is on his way and will arrive by 2:45 PM. I'm texting you his photo and live tracking link now. He's certified in all major brands. Is there anything else I can help with?",
    action: "upsell"
  },
  {
    time: 34,
    speaker: "Customer",
    text: "No, that's perfect. Thank you so much for the quick response.",
    emotion: "grateful"
  },
  {
    time: 38,
    speaker: "AI",
    text: "You're welcome! Mike will take great care of you. After the repair, I'll also send information about our preventive maintenance plans - only 30% of homeowners schedule regular maintenance, but it can prevent 80% of emergency breakdowns. Stay cool!",
    action: "close"
  },
];

const VoiceDemo = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalDuration = 45; // seconds

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    const index = transcriptData.findIndex(
      (item, i) => 
        currentTime >= item.time && 
        (i === transcriptData.length - 1 || currentTime < transcriptData[i + 1].time)
    );
    setActiveIndex(index);
  }, [currentTime]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  const stats = [
    { icon: CheckCircle, label: "Job Booked", value: "+$351", color: "text-accent" },
    { icon: Clock, label: "Response Time", value: "1.2 sec", color: "text-primary" },
    { icon: Search, label: "Booking Rate", value: "94%", color: "text-accent" },
    { icon: DollarSign, label: "Avg Repair Value", value: "$351", color: "text-primary" },
  ];

  return (
    <section id="demo" className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Hear Your Future <span className="text-accent">24/7 Dispatcher</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            No scripts. Just results. Listen to a Friday night emergency call with a homeowner with a broken AC.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="bg-card rounded-2xl card-shadow overflow-hidden">
            {/* Player Section */}
            <div className="bg-primary p-6">
              <div className="flex items-center gap-6">
                <button
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-full bg-accent flex items-center justify-center hover:bg-accent/90 transition-all transform hover:scale-105 shadow-lg"
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 text-accent-foreground" />
                  ) : (
                    <Play className="w-7 h-7 text-accent-foreground ml-1" />
                  )}
                </button>

                <div className="flex-1">
                  <div className="flex items-center gap-2 text-primary-foreground mb-2">
                    <Volume2 className="w-5 h-5" />
                    <span className="font-semibold">Emergency HVAC Call Demo</span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative h-2 bg-primary-foreground/20 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-accent rounded-full transition-all duration-100"
                      style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-sm text-primary-foreground/70 mt-1">
                    <span>{Math.floor(currentTime)}s</span>
                    <span>{totalDuration}s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcript Section */}
            <div className="p-6">
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Transcript */}
                <div className="lg:col-span-2 h-80 overflow-y-auto pr-4 space-y-4">
                  {transcriptData.map((item, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 p-3 rounded-lg transition-all duration-300 ${
                        activeIndex === index
                          ? "bg-accent/10 border-2 border-accent/30 scale-[1.02]"
                          : "bg-secondary/50"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          item.speaker === "AI"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.speaker === "AI" ? (
                          <Bot className="w-5 h-5" />
                        ) : (
                          <span className="text-lg">👤</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">{item.speaker === "AI" ? "AI Dispatcher" : item.speaker}</span>
                          {item.action && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.action === "booking" ? "bg-accent/20 text-accent" :
                              item.action === "upsell" ? "bg-primary/20 text-primary" :
                              item.action === "close" ? "bg-accent/20 text-accent" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {item.action.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="text-foreground/80">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Real-Time Stats */}
                <div className="space-y-4">
                  <h3 className="font-bold text-foreground mb-4">Real-Time Value</h3>
                  
                  {stats.map((stat, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-xl bg-secondary border-2 transition-all duration-500 ${
                        activeIndex >= (index + 1) * 2 - 1
                          ? "border-accent/50 shadow-md scale-105"
                          : "border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        <div>
                          <div className="text-sm text-muted-foreground">{stat.label}</div>
                          <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="pt-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      This agent can be yours in <span className="font-bold text-accent">48 hours</span>.
                    </p>
                    <Button
                      variant="hero"
                      size="lg"
                      className="w-full"
                      onClick={scrollToPricing}
                    >
                      🤖 ACTIVATE MY AI DISPATCHER
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-10 text-center">
            <p className="text-muted-foreground mb-4">
              Try an AI voice demo to see how it would work for your HVAC business.
            </p>
            <Button
              variant="hero"
              size="xl"
              onClick={() => setIsVideoCallOpen(true)}
              className="group"
            >
              <Phone className="w-5 h-5 mr-2 group-hover:animate-pulse" />
              TRY THE AI VOICE DEMO
            </Button>
          </div>
        </div>
      </div>

      <LiveVideoCall 
        isOpen={isVideoCallOpen} 
        onClose={() => setIsVideoCallOpen(false)} 
      />
    </section>
  );
};

export default VoiceDemo;

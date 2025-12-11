import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, CheckCircle, Clock, Search, Bot } from "lucide-react";

const transcriptData = [
  { time: 0, speaker: "Customer", text: "Hello? I have water everywhere! My pipe just burst!", emotion: "urgent" },
  { time: 4, speaker: "AI", text: "I'm so sorry to hear that! I'm dispatching our emergency team right now. Can you tell me your address?", action: "empathy" },
  { time: 10, speaker: "Customer", text: "It's 1234 Oak Street. Please hurry!", emotion: "stressed" },
  { time: 14, speaker: "AI", text: "Got it - 1234 Oak Street. I have a certified technician 30 minutes away. The emergency dispatch fee is $149. Shall I book you in right now?", action: "booking" },
  { time: 24, speaker: "Customer", text: "Yes, please! Whatever it takes!", emotion: "relieved" },
  { time: 28, speaker: "AI", text: "You're all set. Mike will be there by 8:30 PM. While he's there, would you like a complimentary water pressure check to prevent future issues?", action: "upsell" },
  { time: 38, speaker: "Customer", text: "That would be great, thank you!", emotion: "happy" },
  { time: 42, speaker: "AI", text: "Is this an older home? We specialize in proactive pipe inspections that could save you thousands.", action: "probe" },
  { time: 50, speaker: "Customer", text: "It is, actually. Built in the 70s.", emotion: "interested" },
  { time: 54, speaker: "AI", text: "I'll have Mike discuss our comprehensive inspection package. You'll get a text confirmation shortly. We're on our way!", action: "close" },
];

const VoiceDemo = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalDuration = 60; // seconds

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
    { icon: CheckCircle, label: "Job Booked", value: "+$1,295", color: "text-accent" },
    { icon: Clock, label: "Time Saved", value: "18 min", color: "text-primary" },
    { icon: Search, label: "Upsell Potential", value: "+$350", color: "text-accent" },
  ];

  return (
    <section id="demo" className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Hear Your Future <span className="text-accent">24/7 Dispatcher</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            No scripts. Just results. Listen to a Friday night emergency call with a homeowner with a burst pipe.
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
                    <span className="font-semibold">Emergency Call Demo</span>
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
                          <span className="font-semibold text-foreground">{item.speaker}</span>
                          {item.action && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.action === "booking" ? "bg-accent/20 text-accent" :
                              item.action === "upsell" ? "bg-primary/20 text-primary" :
                              item.action === "probe" ? "bg-accent/20 text-accent" :
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
                        activeIndex >= (index + 1) * 3 - 1
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
        </div>
      </div>
    </section>
  );
};

export default VoiceDemo;

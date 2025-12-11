import { Button } from "@/components/ui/button";
import { Volume2, BarChart3 } from "lucide-react";

const HeroSection = () => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen hero-gradient overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 flex flex-col lg:flex-row items-center justify-between min-h-screen py-20 gap-12">
        {/* Left Content */}
        <div className="flex-1 text-center lg:text-left animate-fade-in">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight mb-6">
            Stop Missing{" "}
            <span className="text-accent">$1,200 Calls.</span>
            <br />
            Your AI Dispatcher Is Ready.
          </h1>
          
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mb-8">
            We build your 24/7 AI agent that answers, books, upsells, and probes for large jobs. 
            <span className="font-semibold text-primary-foreground"> Done-for-you in 48 hours. No contracts.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Button 
              variant="hero" 
              size="xl" 
              onClick={() => scrollToSection("demo")}
              className="group"
            >
              <Volume2 className="w-5 h-5 group-hover:animate-pulse" />
              LISTEN TO A DEMO CALL
            </Button>
            
            <Button 
              variant="heroSecondary" 
              size="xl"
              onClick={() => scrollToSection("pricing")}
            >
              <BarChart3 className="w-5 h-5" />
              SEE PLANS FROM $497/MO
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

        {/* Right Content - AI Avatar */}
        <div className="flex-1 flex justify-center lg:justify-end animate-float">
          <div className="relative">
            {/* Avatar Container */}
            <div className="w-72 h-72 md:w-80 md:h-80 rounded-full bg-gradient-to-br from-primary-foreground/20 to-accent/30 flex items-center justify-center shadow-2xl">
              <div className="w-56 h-56 md:w-64 md:h-64 rounded-full bg-gradient-to-br from-accent/40 to-primary/60 flex items-center justify-center">
                <div className="text-6xl md:text-7xl">🤖</div>
              </div>
            </div>

            {/* Speech Bubble */}
            <div className="absolute -bottom-4 -left-8 md:-left-16 max-w-xs bg-card rounded-2xl p-4 shadow-xl animate-bounce-subtle">
              <div className="absolute -top-2 right-8 w-4 h-4 bg-card transform rotate-45" />
              <p className="text-foreground text-sm md:text-base font-medium leading-relaxed">
                "Hi, I'm your AI dispatcher. I handle the <span className="text-accent font-bold">28% of calls</span> you're missing. Want to hear me book a $1,200 emergency job?"
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
  );
};

export default HeroSection;

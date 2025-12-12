import { Button } from "@/components/ui/button";
import { Clock, Rocket } from "lucide-react";

const StickyFooter = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur-sm border-t border-primary-foreground/10 py-4 shadow-2xl">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-primary-foreground">
          <Clock className="w-5 h-5 text-accent animate-pulse" />
          <span className="font-semibold">
            Ready to capture every HVAC call? Start Your <span className="text-accent">48-Hour Build.</span>
          </span>
        </div>
        
        <Button
          variant="hero"
          size="lg"
          onClick={scrollToContact}
          className="shrink-0"
        >
          <Rocket className="w-5 h-5" />
          GET A CUSTOM QUOTE
        </Button>
      </div>
    </div>
  );
};

export default StickyFooter;

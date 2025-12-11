import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Mail, ArrowRight, Gift } from "lucide-react";

const ExitIntentPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasShown) {
        setIsVisible(true);
        setHasShown(true);
      }
    };

    // Also trigger on mobile when user scrolls up quickly (exit behavior)
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY - 100 && currentScrollY < 200 && !hasShown) {
        setIsVisible(true);
        setHasShown(true);
      }
      lastScrollY = currentScrollY;
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("scroll", handleScroll);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [hasShown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Here you would integrate with your email service
      console.log("Lead captured:", email);
      setIsSubmitted(true);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-foreground/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors z-10"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Header Banner */}
        <div className="bg-primary p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent flex items-center justify-center">
            <Gift className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-2">
            Wait! Don't Leave Empty-Handed
          </h2>
        </div>

        {/* Content */}
        <div className="p-8">
          {!isSubmitted ? (
            <>
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  FREE Guide: <span className="text-accent">7 Ways to Generate More Local Plumbing Leads</span>
                </h3>
                <p className="text-muted-foreground">
                  Discover proven strategies that top plumbers use to fill their calendars with high-paying jobs.
                </p>
              </div>

              {/* PDF Preview */}
              <div className="bg-secondary rounded-xl p-4 mb-6 flex items-center gap-4">
                <div className="w-16 h-20 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0 border-2 border-destructive/20">
                  <span className="text-destructive font-bold text-xs">PDF</span>
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">Local Lead Generation Playbook</div>
                  <div className="text-muted-foreground text-xs mt-1">12 pages • Instant Download</div>
                  <div className="flex items-center gap-1 mt-2 text-accent text-xs font-medium">
                    <Download className="w-3 h-3" />
                    2,847 downloads this month
                  </div>
                </div>
              </div>

              {/* Email Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your best email..."
                    required
                    className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-border bg-background text-foreground text-lg focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  />
                </div>
                <Button variant="hero" size="xl" type="submit" className="w-full">
                  <Download className="w-5 h-5" />
                  GET MY FREE GUIDE NOW
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground mt-4">
                🔒 We respect your privacy. Unsubscribe anytime.
              </p>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-accent/20 flex items-center justify-center">
                <Download className="w-10 h-10 text-accent" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">Check Your Inbox! 📧</h3>
              <p className="text-muted-foreground mb-6">
                Your free guide is on its way to <span className="font-semibold text-foreground">{email}</span>
              </p>
              <Button variant="accent" size="lg" onClick={handleClose}>
                <ArrowRight className="w-5 h-5" />
                Continue Exploring
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExitIntentPopup;

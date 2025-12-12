import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Mail, ArrowRight, Gift, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import leadMagnetCover from "@/assets/lead-magnet-cover.png";

const ExitIntentPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const { toast } = useToast();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter your name and email.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-lead-magnet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Get the PDF blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '7-Ways-To-Generate-Plumbing-Leads.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setIsSubmitted(true);
      toast({
        title: "Download started!",
        description: "Your PDF guide is downloading now.",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Download failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
                <img 
                  src={leadMagnetCover} 
                  alt="7 Ways to Generate More Local Plumbing Leads" 
                  className="w-20 h-28 object-cover rounded-lg shadow-md"
                />
                <div>
                  <div className="font-semibold text-foreground text-sm">Local Lead Generation Playbook</div>
                  <div className="text-muted-foreground text-xs mt-1">12 pages • Instant Download</div>
                  <div className="flex items-center gap-1 mt-2 text-accent text-xs font-medium">
                    <Download className="w-3 h-3" />
                    2,847 downloads this month
                  </div>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name..."
                    required
                    className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-border bg-background text-foreground text-lg focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your best email..."
                    required
                    className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-border bg-background text-foreground text-lg focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  />
                </div>
                <Button 
                  variant="hero" 
                  size="xl" 
                  type="submit" 
                  className="w-full"
                  disabled={isSubmitting}
                >
                  <Download className="w-5 h-5" />
                  {isSubmitting ? "PREPARING DOWNLOAD..." : "GET MY FREE GUIDE NOW"}
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
              <h3 className="text-2xl font-bold text-foreground mb-2">Your Download Has Started! 📥</h3>
              <p className="text-muted-foreground mb-6">
                Check your downloads folder for the PDF guide.
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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Mail, Gift, User, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import leadMagnetCover from "@/assets/lead-magnet-cover.png";

const ExitIntentPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasShown) {
        setIsVisible(true);
        setHasShown(true);
      }
    };

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
      // Submit lead to GHL
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
        throw new Error('Failed to submit');
      }

      setIsSubmitted(true);
      toast({
        title: "Success!",
        description: "Click the button below to download your guide.",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-lead-magnet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: 'download' }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '7-Ways-To-Generate-Plumbing-Leads.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download started!",
        description: "Check your downloads folder.",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Download failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-foreground/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div 
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10 shadow-md"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {!isSubmitted ? (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Gift className="w-6 h-6 text-accent-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Wait! Free Guide Inside
                </h2>
                <p className="text-sm text-muted-foreground">
                  Get it before you go
                </p>
              </div>
            </div>

            {/* PDF Preview */}
            <div className="bg-secondary rounded-xl p-3 mb-4 flex items-center gap-3">
              <img 
                src={leadMagnetCover} 
                alt="Lead Generation Guide" 
                className="w-14 h-20 object-cover rounded-lg shadow-md shrink-0"
              />
              <div className="min-w-0">
                <div className="font-semibold text-foreground text-sm leading-tight">
                  7 Proven Ways to Generate More Local Plumbing Leads
                </div>
                <div className="text-muted-foreground text-xs mt-1">8 pages • Instant Download</div>
                <div className="flex items-center gap-1 mt-1 text-accent text-xs font-medium">
                  <Download className="w-3 h-3" />
                  2,847 downloads
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name..."
                  required
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email..."
                  required
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                />
              </div>
              <Button 
                variant="hero" 
                size="lg" 
                type="submit" 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "SUBMITTING..." : "UNLOCK FREE GUIDE"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-3">
              🔒 No spam. Unsubscribe anytime.
            </p>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">You're In! 🎉</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Your guide is ready. Click below to download.
            </p>
            <Button 
              variant="hero" 
              size="lg" 
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full mb-3"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? "DOWNLOADING..." : "DOWNLOAD PDF NOW"}
            </Button>
            <button 
              onClick={handleClose}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Continue browsing
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExitIntentPopup;

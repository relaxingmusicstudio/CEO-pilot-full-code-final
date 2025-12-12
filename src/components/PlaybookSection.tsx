import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Mail, User, CheckCircle, BookOpen, Target, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import leadMagnetCover from "@/assets/lead-magnet-cover.png";

const PlaybookSection = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

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
          body: JSON.stringify({ name: name.trim(), email: email.trim(), formName: "Playbook Download Form" }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      setIsSubmitted(true);
      toast({
        title: "Success!",
        description: "Your playbook is ready to download.",
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

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = '/Local-Service-Playbook.pdf';
    link.download = 'Local-Service-Playbook.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download started!",
      description: "Check your downloads folder.",
    });
  };

  const benefits = [
    { icon: Target, text: "Dominate Google & Maps in 7 days" },
    { icon: TrendingUp, text: "Automate your 5-star review system" },
    { icon: BookOpen, text: "Build referral networks that feed you" },
  ];

  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left - PDF Preview */}
            <div className="relative order-2 lg:order-1 pb-4">
              <div className="relative mx-auto max-w-sm lg:max-w-md">
                {/* Shadow/depth effect */}
                <div className="absolute inset-4 bg-primary/20 rounded-2xl blur-2xl" />
                
                {/* PDF Cover */}
                <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
                  <img 
                    src={leadMagnetCover} 
                    alt="The Local Service Playbook Cover" 
                    className="w-full h-auto"
                  />
                  
                  {/* Stats badge */}
                  <div className="absolute bottom-4 right-4 bg-accent text-accent-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    <span className="font-semibold text-sm">3,200+ downloads</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - Content & Form */}
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-sm font-medium mb-4">
                <BookOpen className="w-4 h-4" />
                Free 10-Page Playbook
              </div>
              
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                The Local Service Playbook
              </h2>
              
              <p className="text-lg text-muted-foreground mb-6">
                Your 90-day system to capture every lead, book more jobs, and stop losing money. 
                Includes actionable flowcharts, checklists, and proven strategies.
              </p>

              {/* Benefits */}
              <ul className="space-y-3 mb-8">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <benefit.icon className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-foreground">{benefit.text}</span>
                  </li>
                ))}
              </ul>

              {!isSubmitted ? (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        required
                        className="w-full h-12 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                      />
                    </div>
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Your email"
                        required
                        className="w-full h-12 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <Button 
                    variant="hero" 
                    size="lg" 
                    type="submit" 
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                  >
                    <Download className="w-4 h-4" />
                    {isSubmitting ? "SENDING..." : "GET FREE PLAYBOOK"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    🔒 No spam. Unsubscribe anytime.
                  </p>
                </form>
              ) : (
                <div className="bg-accent/10 rounded-xl p-6 text-center">
                  <CheckCircle className="w-12 h-12 text-accent mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-foreground mb-2">You're In! 🎉</h3>
                  <p className="text-muted-foreground mb-4">
                    Click below to download your playbook.
                  </p>
                  <Button 
                    variant="hero" 
                    size="lg" 
                    onClick={handleDownload}
                  >
                    <Download className="w-4 h-4" />
                    DOWNLOAD PLAYBOOK
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlaybookSection;

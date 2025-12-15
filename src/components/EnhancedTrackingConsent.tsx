import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, Shield, Mail, Sparkles, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CONSENT_STORAGE_KEY = "enhanced_tracking_consent";
const CONSENT_ASKED_KEY = "enhanced_tracking_asked";

interface ConsentPreferences {
  enhanced_analytics: boolean;
  marketing_emails: boolean;
  personalization: boolean;
}

const EnhancedTrackingConsent = () => {
  const [showDialog, setShowDialog] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    enhanced_analytics: false,
    marketing_emails: false,
    personalization: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const hasAsked = localStorage.getItem(CONSENT_ASKED_KEY);
    const storedConsent = localStorage.getItem(CONSENT_STORAGE_KEY);

    if (storedConsent) {
      try {
        setPreferences(JSON.parse(storedConsent));
      } catch {
        // Invalid stored consent, will show dialog
      }
    }

    if (!hasAsked && !storedConsent) {
      const timer = setTimeout(() => setShowDialog(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const getVisitorId = (): string => {
    let visitorId = localStorage.getItem("visitor_id");
    if (!visitorId) {
      visitorId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("visitor_id", visitorId);
    }
    return visitorId;
  };

  const saveConsent = async (prefs: ConsentPreferences) => {
    setIsSaving(true);
    try {
      const visitorId = getVisitorId();
      
      const { error } = await supabase
        .from('user_consent')
        .upsert({
          visitor_id: visitorId,
          enhanced_analytics: prefs.enhanced_analytics,
          marketing_emails: prefs.marketing_emails,
          personalization: prefs.personalization,
          consent_version: 'v1.0',
          consented_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
        }, {
          onConflict: 'visitor_id'
        });

      if (error) {
        console.error('Error saving consent:', error);
      }

      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(prefs));
      localStorage.setItem(CONSENT_ASKED_KEY, "true");
      setPreferences(prefs);
      setShowDialog(false);

      if (prefs.enhanced_analytics) {
        toast.success("Enhanced analytics enabled. Thank you!");
      }
    } catch (error) {
      console.error('Error saving consent:', error);
      toast.error("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptAll = () => {
    saveConsent({
      enhanced_analytics: true,
      marketing_emails: true,
      personalization: true,
    });
  };

  const handleDecline = () => {
    saveConsent({
      enhanced_analytics: false,
      marketing_emails: false,
      personalization: false,
    });
  };

  const handleSaveCustom = () => {
    saveConsent(preferences);
  };

  if (!showDialog) return null;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-w-md overflow-hidden p-0 animate-in slide-in-from-bottom-4 duration-500 ring-2 ring-primary/30 shadow-2xl shadow-primary/20">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-primary via-primary/90 to-primary/80 px-6 py-4 text-primary-foreground">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-primary-foreground">
              <Sparkles className="h-6 w-6 animate-pulse" />
              Unlock Personalized Insights
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/90">
              Get tailored recommendations and help us improve your experience
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Benefit Banner */}
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-accent/50 px-4 py-3 border border-accent">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground">
            Enable all for the best experience — it's anonymous & secure
          </p>
        </div>

        <div className="space-y-3 px-6 py-4">
          {/* Enhanced Analytics */}
          <div className="flex items-start justify-between gap-4 rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 transition-all hover:border-primary/40">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Eye className="h-4 w-4 text-primary" />
                </div>
                Enhanced Analytics
              </Label>
              <p className="text-xs text-muted-foreground">
                Track patterns to improve UX • <span className="text-primary font-medium">Fully anonymized</span>
              </p>
            </div>
            <Switch
              checked={preferences.enhanced_analytics}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, enhanced_analytics: checked }))
              }
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Personalization */}
          <div className="flex items-start justify-between gap-4 rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 transition-all hover:border-primary/40">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                Smart Personalization
              </Label>
              <p className="text-xs text-muted-foreground">
                AI-powered recommendations • <span className="text-primary font-medium">Just for you</span>
              </p>
            </div>
            <Switch
              checked={preferences.personalization}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, personalization: checked }))
              }
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Marketing */}
          <div className="flex items-start justify-between gap-4 rounded-xl border-2 border-muted bg-muted/30 p-4 transition-all hover:border-muted-foreground/30">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <div className="rounded-lg bg-muted p-1.5">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                Product Updates
              </Label>
              <p className="text-xs text-muted-foreground">
                New features & tips • <span className="font-medium">Unsubscribe anytime</span>
              </p>
            </div>
            <Switch
              checked={preferences.marketing_emails}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, marketing_emails: checked }))
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 px-6 py-5">
          <Button 
            onClick={handleAcceptAll} 
            disabled={isSaving}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-primary/80 text-lg font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.02]"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Enable All & Continue
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSaveCustom}
              disabled={isSaving}
            >
              Save My Choices
            </Button>
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground"
              onClick={handleDecline}
              disabled={isSaving}
            >
              Decline All
            </Button>
          </div>
        </div>

        <p className="px-6 pb-4 text-xs text-muted-foreground text-center">
          You can change these preferences anytime in Settings.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedTrackingConsent;

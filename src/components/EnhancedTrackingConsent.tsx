import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, Shield, X } from "lucide-react";
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
    // Check if we've already asked or have stored consent
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
      // Delay showing dialog for better UX
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
      
      // Save to database
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
        // Still save locally even if DB fails
      }

      // Save locally
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Help Us Improve Your Experience
          </DialogTitle>
          <DialogDescription>
            Enable enhanced analytics to help us understand how you use our platform and provide better recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Enhanced Analytics */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Enhanced Analytics
              </Label>
              <p className="text-xs text-muted-foreground">
                Track click patterns and scroll behavior to improve UX. Data is anonymized.
              </p>
            </div>
            <Switch
              checked={preferences.enhanced_analytics}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, enhanced_analytics: checked }))
              }
            />
          </div>

          {/* Personalization */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Smart Personalization
              </Label>
              <p className="text-xs text-muted-foreground">
                Get AI-powered recommendations based on your usage patterns.
              </p>
            </div>
            <Switch
              checked={preferences.personalization}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, personalization: checked }))
              }
            />
          </div>

          {/* Marketing */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Product Updates</Label>
              <p className="text-xs text-muted-foreground">
                Receive occasional emails about new features and tips.
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

        <div className="flex flex-col gap-2">
          <Button onClick={handleAcceptAll} disabled={isSaving}>
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
              className="flex-1"
              onClick={handleDecline}
              disabled={isSaving}
            >
              Decline All
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          You can change these preferences anytime in Settings.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedTrackingConsent;

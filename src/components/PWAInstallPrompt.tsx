import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, X, Wifi, WifiOff, Bell } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';
import { toast } from 'sonner';

export function PWAInstallPrompt() {
  const { 
    isInstallable, 
    isInstalled, 
    isOnline, 
    install, 
    requestNotificationPermission,
    notificationPermission 
  } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  // DEV-ONLY: Offline mode must never ship to production
  const devOfflineFlag =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.localStorage.getItem("__DEV_OFFLINE") === "true");

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      toast.success('App installed successfully!');
    }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      toast.success('Notifications enabled!');
    } else {
      toast.error('Notification permission denied');
    }
  };

  // Show offline indicator
  if (devOfflineFlag && !isOnline) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-4 py-2 rounded-full text-sm">
          <WifiOff className="h-4 w-4" />
          <span>Offline Mode</span>
        </div>
      </div>
    );
  }

  // Show install prompt
  if (isInstallable && !dismissed && !isInstalled) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Install App</CardTitle>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              Install ApexLocal360 for faster access and offline support
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button onClick={handleInstall} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Install Now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show notification prompt if installed but notifications not enabled
  if (isInstalled && notificationPermission === 'default') {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Enable Notifications</CardTitle>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              Get alerts for hot leads and important updates
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button onClick={handleEnableNotifications} className="w-full">
              <Bell className="h-4 w-4 mr-2" />
              Enable Notifications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

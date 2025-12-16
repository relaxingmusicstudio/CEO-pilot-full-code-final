import { useState } from "react";
import { CEOChatPanel } from "@/components/CEOChatPanel";
import { TodaysFocusWidget } from "@/components/ceo/TodaysFocusWidget";
import { QuickActionsPanel } from "@/components/ceo/QuickActionsPanel";
import { SystemStatusWidget } from "@/components/ceo/SystemStatusWidget";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { 
  PanelLeftClose, 
  PanelLeft,
  LayoutDashboard,
  ArrowLeft
} from "lucide-react";

export default function UnifiedDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailPanel, setDetailPanel] = useState<{ type: string; title: string } | null>(null);
  const navigate = useNavigate();

  const handleDetailNavigation = (path: string, title: string) => {
    // For now, navigate to the detail page
    // In future iterations, could open in a slide-over panel
    navigate(path);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Command Center</h1>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* AI Chat Panel - Primary Interface */}
        <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'mr-0' : ''}`}>
          <CEOChatPanel />
        </div>

        {/* CRM Sidebar */}
        {sidebarOpen && (
          <aside className="w-80 border-l bg-muted/30 overflow-y-auto">
            <div className="p-4 space-y-4">
              <TodaysFocusWidget />
              <QuickActionsPanel />
              <SystemStatusWidget />
            </div>
          </aside>
        )}
      </div>

      {/* Footer Navigation */}
      <footer className="border-t px-4 py-2 bg-card">
        <div className="container flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/app/command-center")}
            className="gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Command Center
          </Button>
        </div>
      </footer>

      {/* Detail Panel Sheet */}
      <Sheet open={!!detailPanel} onOpenChange={() => setDetailPanel(null)}>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setDetailPanel(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {detailPanel?.title}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {/* Detail content would go here based on detailPanel.type */}
            <p className="text-muted-foreground">Detail view for {detailPanel?.type}</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

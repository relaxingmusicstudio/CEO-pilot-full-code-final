import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import CEOHub from "@/pages/CEOHub";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VisitorProvider } from "@/contexts/VisitorContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import Index from "./pages/Index";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Auth from "./pages/Auth";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminInbox from "./pages/AdminInbox";
import AdminContacts from "./pages/AdminContacts";
import AdminClients from "./pages/AdminClients";
import AdminLeads from "./pages/AdminLeads";
import AdminSequences from "./pages/AdminSequences";
import CEOConsole from "./pages/CEOConsole";
import AdminSettings from "./pages/AdminSettings";
import AdminContent from "./pages/AdminContent";
import AdminSocial from "./pages/AdminSocial";
import AdminAds from "./pages/AdminAds";
import AdminAgentAnalytics from "./pages/AdminAgentAnalytics";
import AdminAgentContent from "./pages/AdminAgentContent";
import AdminAgentSocial from "./pages/AdminAgentSocial";
import AdminAgentAds from "./pages/AdminAgentAds";
import AdminAgentSequences from "./pages/AdminAgentSequences";
import AdminAgentInbox from "./pages/AdminAgentInbox";
import AdminAgentFunnels from "./pages/AdminAgentFunnels";
import AdminAgentYouTube from "./pages/AdminAgentYouTube";
import AdminAutomation from "./pages/AdminAutomation";
import AdminOnboarding from "./pages/AdminOnboarding";
import AdminCRM from "./pages/AdminCRM";
import AdminDialer from "./pages/AdminDialer";
import AdminOutreach from "./pages/AdminOutreach";
import AdminSMSBlast from "./pages/AdminSMSBlast";
import AdminLearning from "./pages/AdminLearning";
import AdminSolo from "./pages/AdminSolo";
import AdminPipeline from "./pages/AdminPipeline";
import AdminSystemHealth from "./pages/AdminSystemHealth";
import AdminAccounts from "./pages/AdminAccounts";
import AdminControlPanel from "./pages/AdminControlPanel";
import AdminBypassQueue from "./pages/AdminBypassQueue";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <VisitorProvider>
            <Toaster />
            <Sonner />
            <PWAInstallPrompt />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin/analytics" element={<ProtectedRoute requireAdmin><AdminAnalytics /></ProtectedRoute>} />
                <Route path="/admin/hub" element={<ProtectedRoute requireAdmin><CEOHub /></ProtectedRoute>} />
                <Route path="/admin/ceo" element={<ProtectedRoute requireAdmin><CEOConsole /></ProtectedRoute>} />
                <Route path="/admin/inbox" element={<ProtectedRoute requireAdmin><AdminInbox /></ProtectedRoute>} />
                <Route path="/admin/contacts" element={<ProtectedRoute requireAdmin><AdminContacts /></ProtectedRoute>} />
                <Route path="/admin/clients" element={<ProtectedRoute requireAdmin><AdminClients /></ProtectedRoute>} />
                <Route path="/admin/leads" element={<ProtectedRoute requireAdmin><AdminLeads /></ProtectedRoute>} />
                <Route path="/admin/accounts" element={<ProtectedRoute requireAdmin><AdminAccounts /></ProtectedRoute>} />
                <Route path="/admin/onboarding" element={<ProtectedRoute requireAdmin><AdminOnboarding /></ProtectedRoute>} />
                <Route path="/admin/crm" element={<ProtectedRoute requireAdmin><AdminCRM /></ProtectedRoute>} />
                <Route path="/admin/dialer" element={<ProtectedRoute requireAdmin><AdminDialer /></ProtectedRoute>} />
                <Route path="/admin/outreach" element={<ProtectedRoute requireAdmin><AdminOutreach /></ProtectedRoute>} />
                <Route path="/admin/sms-blast" element={<ProtectedRoute requireAdmin><AdminSMSBlast /></ProtectedRoute>} />
                <Route path="/admin/sequences" element={<ProtectedRoute requireAdmin><AdminSequences /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>} />
                <Route path="/admin/content" element={<ProtectedRoute requireAdmin><AdminContent /></ProtectedRoute>} />
                <Route path="/admin/social" element={<ProtectedRoute requireAdmin><AdminSocial /></ProtectedRoute>} />
                <Route path="/admin/ads" element={<ProtectedRoute requireAdmin><AdminAds /></ProtectedRoute>} />
                {/* Agent Pages */}
                <Route path="/admin/agent/funnels" element={<ProtectedRoute requireAdmin><AdminAgentFunnels /></ProtectedRoute>} />
                <Route path="/admin/agent/analytics" element={<ProtectedRoute requireAdmin><AdminAgentAnalytics /></ProtectedRoute>} />
                <Route path="/admin/agent/content" element={<ProtectedRoute requireAdmin><AdminAgentContent /></ProtectedRoute>} />
                <Route path="/admin/agent/social" element={<ProtectedRoute requireAdmin><AdminAgentSocial /></ProtectedRoute>} />
                <Route path="/admin/agent/ads" element={<ProtectedRoute requireAdmin><AdminAgentAds /></ProtectedRoute>} />
                <Route path="/admin/agent/sequences" element={<ProtectedRoute requireAdmin><AdminAgentSequences /></ProtectedRoute>} />
                <Route path="/admin/agent/inbox" element={<ProtectedRoute requireAdmin><AdminAgentInbox /></ProtectedRoute>} />
                <Route path="/admin/agent/youtube" element={<ProtectedRoute requireAdmin><AdminAgentYouTube /></ProtectedRoute>} />
                <Route path="/admin/automation" element={<ProtectedRoute requireAdmin><AdminAutomation /></ProtectedRoute>} />
                <Route path="/admin/learning" element={<ProtectedRoute requireAdmin><AdminLearning /></ProtectedRoute>} />
                <Route path="/admin/solo" element={<ProtectedRoute requireAdmin><AdminSolo /></ProtectedRoute>} />
                <Route path="/admin/pipeline" element={<ProtectedRoute requireAdmin><AdminPipeline /></ProtectedRoute>} />
                <Route path="/admin/system-health" element={<ProtectedRoute requireAdmin><AdminSystemHealth /></ProtectedRoute>} />
                <Route path="/admin/control-panel" element={<ProtectedRoute requireAdmin><AdminControlPanel /></ProtectedRoute>} />
                <Route path="/admin/bypass-queue" element={<ProtectedRoute requireAdmin><AdminBypassQueue /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </VisitorProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;

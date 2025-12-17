import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VisitorProvider } from "@/contexts/VisitorContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import EnhancedTrackingConsent from "@/components/EnhancedTrackingConsent";

// Public pages
import Index from "./pages/Index";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Auth from "./pages/Auth";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookiePolicy from "./pages/CookiePolicy";
import NotFound from "./pages/NotFound";

// CEO Command Center - Primary Interface
import CEOHome from "./pages/CEOHome";
import DecisionsDashboard from "./pages/DecisionsDashboard";
import OnboardingConversation from "./pages/OnboardingConversation";

// Capability Pages (accessed via Intelligence Grid cards)
import AdminPipeline from "./pages/AdminPipeline";
import AdminInbox from "./pages/AdminInbox";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminBilling from "./pages/AdminBilling";
import AdminContent from "./pages/AdminContent";
import AdminSettings from "./pages/AdminSettings";
import AdminClients from "./pages/AdminClients";
import AdminLeads from "./pages/AdminLeads";
import AdminSequences from "./pages/AdminSequences";
import AdminCRM from "./pages/AdminCRM";
import AdminContacts from "./pages/AdminContacts";
import KnowledgeVault from "./pages/KnowledgeVault";
import AdminSystemHealth from "./pages/AdminSystemHealth";
import AdminAudit from "./pages/AdminAudit";
import AdminHelp from "./pages/AdminHelp";
import AdminBusinessSetup from "./pages/AdminBusinessSetup";

// Platform Admin (hidden from regular users)
import AdminTenants from "./pages/AdminTenants";

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
              <CookieConsentBanner />
              <EnhancedTrackingConsent />
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Index />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/cookies" element={<CookiePolicy />} />
                <Route path="/auth" element={<Auth />} />
                
                {/* CEO COMMAND CENTER - Primary Landing */}
                <Route path="/app" element={<ProtectedRoute><CEOHome /></ProtectedRoute>} />
                
                {/* Onboarding - New user flow */}
                <Route path="/app/onboarding" element={<ProtectedRoute skipOnboardingCheck><OnboardingConversation /></ProtectedRoute>} />
                
                {/* Decisions - Human approval surface */}
                <Route path="/app/decisions" element={<ProtectedRoute><DecisionsDashboard /></ProtectedRoute>} />
                
                {/* Capability Pages - Accessed from Intelligence Grid */}
                <Route path="/app/pipeline" element={<ProtectedRoute><AdminPipeline /></ProtectedRoute>} />
                <Route path="/app/inbox" element={<ProtectedRoute><AdminInbox /></ProtectedRoute>} />
                <Route path="/app/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
                <Route path="/app/billing" element={<ProtectedRoute><AdminBilling /></ProtectedRoute>} />
                <Route path="/app/content" element={<ProtectedRoute><AdminContent /></ProtectedRoute>} />
                <Route path="/app/clients" element={<ProtectedRoute><AdminClients /></ProtectedRoute>} />
                <Route path="/app/leads" element={<ProtectedRoute><AdminLeads /></ProtectedRoute>} />
                <Route path="/app/sequences" element={<ProtectedRoute><AdminSequences /></ProtectedRoute>} />
                <Route path="/app/crm" element={<ProtectedRoute><AdminCRM /></ProtectedRoute>} />
                <Route path="/app/contacts" element={<ProtectedRoute><AdminContacts /></ProtectedRoute>} />
                <Route path="/app/vault" element={<ProtectedRoute><KnowledgeVault /></ProtectedRoute>} />
                
                {/* Settings & System */}
                <Route path="/app/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
                <Route path="/app/health" element={<ProtectedRoute><AdminSystemHealth /></ProtectedRoute>} />
                <Route path="/app/audit" element={<ProtectedRoute><AdminAudit /></ProtectedRoute>} />
                <Route path="/app/help" element={<ProtectedRoute><AdminHelp /></ProtectedRoute>} />
                <Route path="/app/business-setup" element={<ProtectedRoute><AdminBusinessSetup /></ProtectedRoute>} />
                
                {/* Platform Admin - Hidden */}
                <Route path="/app/admin/tenants" element={<ProtectedRoute requireAdmin><AdminTenants /></ProtectedRoute>} />
                
                {/* Catch all - 404 */}
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

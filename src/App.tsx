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
import CookieConsentBanner from "@/components/CookieConsentBanner";
import EnhancedTrackingConsent from "@/components/EnhancedTrackingConsent";
import Index from "./pages/Index";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Auth from "./pages/Auth";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookiePolicy from "./pages/CookiePolicy";
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
// GOVERNANCE #10: AdminBypassQueue removed - no bypass allowed
import AdminUserSettings from "./pages/AdminUserSettings";
import AdminBilling from "./pages/AdminBilling";
import AdminHelp from "./pages/AdminHelp";
import AdminAudit from "./pages/AdminAudit";
import AdminApprovalQueue from "./pages/AdminApprovalQueue";
import AdminPreLaunch from "./pages/AdminPreLaunch";
import AdminTrainingMode from "./pages/AdminTrainingMode";
import AdminProspecting from "./pages/AdminProspecting";
import AdminRetention from "./pages/AdminRetention";
import AdminMockMode from "./pages/AdminMockMode";
import NotFound from "./pages/NotFound";
// Dual Workspace Architecture
import DualWorkspaceLayout from "./layouts/DualWorkspaceLayout";
import AICEODashboard from "./pages/AICEODashboard";
import CommandCenterHome from "./pages/CommandCenterHome";
import KnowledgeVault from "./pages/KnowledgeVault";
import UnifiedDashboard from "./pages/UnifiedDashboard";
import AdminBusinessSetup from "./pages/AdminBusinessSetup";
// Governance Entry Point
import DecisionsDashboard from "./pages/DecisionsDashboard";
// GOVERNANCE #5: Conversation-first for new users
import OnboardingConversation from "./pages/OnboardingConversation";
// Platform Admin: Tenant Management
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
                <Route path="/" element={<Index />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/cookies" element={<CookiePolicy />} />
                <Route path="/auth" element={<Auth />} />
                
                {/* GOVERNANCE: /app opens to Decision Cards (human control surface) */}
                {/* New users are automatically redirected to /app/onboarding by ProtectedRoute */}
                <Route path="/app" element={<ProtectedRoute requireAdmin><DecisionsDashboard /></ProtectedRoute>} />
                
                {/* GOVERNANCE #5: Conversation-first onboarding for NEW users */}
                <Route path="/app/onboarding" element={<ProtectedRoute requireAdmin skipOnboardingCheck><OnboardingConversation /></ProtectedRoute>} />
                
                {/* GOVERNANCE: /app/ceo is read-only intelligence (no execution controls) */}
                <Route path="/app/ceo" element={<ProtectedRoute requireAdmin><AICEODashboard /></ProtectedRoute>} />
                <Route path="/app/ceo/opportunities" element={<ProtectedRoute requireAdmin><AICEODashboard /></ProtectedRoute>} />
                <Route path="/app/ceo/strategies" element={<ProtectedRoute requireAdmin><AICEODashboard /></ProtectedRoute>} />
                <Route path="/app/ceo/risks" element={<ProtectedRoute requireAdmin><AICEODashboard /></ProtectedRoute>} />
                <Route path="/app/ceo/learning" element={<ProtectedRoute requireAdmin><AICEODashboard /></ProtectedRoute>} />
                
                {/* GOVERNANCE: Human Control surfaces */}
                <Route path="/app/controls" element={<ProtectedRoute requireAdmin><AdminControlPanel /></ProtectedRoute>} />
                <Route path="/app/health" element={<ProtectedRoute requireAdmin><AdminSystemHealth /></ProtectedRoute>} />
                <Route path="/app/audit" element={<ProtectedRoute requireAdmin><AdminAudit /></ProtectedRoute>} />
                <Route path="/app/command-center" element={<ProtectedRoute requireAdmin><CommandCenterHome /></ProtectedRoute>} />
                <Route path="/app/command-center/crm" element={<ProtectedRoute requireAdmin><AdminCRM /></ProtectedRoute>} />
                <Route path="/app/command-center/pipeline" element={<ProtectedRoute requireAdmin><AdminPipeline /></ProtectedRoute>} />
                <Route path="/app/command-center/content" element={<ProtectedRoute requireAdmin><AdminContent /></ProtectedRoute>} />
                <Route path="/app/command-center/sequences" element={<ProtectedRoute requireAdmin><AdminSequences /></ProtectedRoute>} />
                <Route path="/app/command-center/clients" element={<ProtectedRoute requireAdmin><AdminClients /></ProtectedRoute>} />
                <Route path="/app/command-center/approvals" element={<ProtectedRoute requireAdmin><AdminApprovalQueue /></ProtectedRoute>} />
                <Route path="/app/command-center/vault" element={<ProtectedRoute requireAdmin><KnowledgeVault /></ProtectedRoute>} />
                <Route path="/app/command-center/system-health" element={<ProtectedRoute requireAdmin><AdminSystemHealth /></ProtectedRoute>} />
                <Route path="/app/command-center/settings" element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>} />
                <Route path="/app/command-center/analytics" element={<ProtectedRoute requireAdmin><AdminAnalytics /></ProtectedRoute>} />
                <Route path="/app/command-center/billing" element={<ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>} />
                <Route path="/app/command-center/prospecting" element={<ProtectedRoute requireAdmin><AdminProspecting /></ProtectedRoute>} />
                <Route path="/app/command-center/retention" element={<ProtectedRoute requireAdmin><AdminRetention /></ProtectedRoute>} />
                <Route path="/app/command-center/outreach" element={<ProtectedRoute requireAdmin><AdminOutreach /></ProtectedRoute>} />
                <Route path="/app/command-center/sms" element={<ProtectedRoute requireAdmin><AdminSMSBlast /></ProtectedRoute>} />
                <Route path="/app/command-center/dialer" element={<ProtectedRoute requireAdmin><AdminDialer /></ProtectedRoute>} />
                <Route path="/app/command-center/social" element={<ProtectedRoute requireAdmin><AdminSocial /></ProtectedRoute>} />
                <Route path="/app/command-center/automation" element={<ProtectedRoute requireAdmin><AdminAutomation /></ProtectedRoute>} />
                <Route path="/app/command-center/onboarding" element={<ProtectedRoute requireAdmin><AdminOnboarding /></ProtectedRoute>} />
                <Route path="/app/command-center/inbox" element={<ProtectedRoute requireAdmin><AdminInbox /></ProtectedRoute>} />
                <Route path="/app/command-center/contacts" element={<ProtectedRoute requireAdmin><AdminContacts /></ProtectedRoute>} />
                <Route path="/app/command-center/leads" element={<ProtectedRoute requireAdmin><AdminLeads /></ProtectedRoute>} />
                <Route path="/app/command-center/help" element={<ProtectedRoute requireAdmin><AdminHelp /></ProtectedRoute>} />
                <Route path="/app/business-setup" element={<ProtectedRoute requireAdmin><AdminBusinessSetup /></ProtectedRoute>} />
                {/* Platform Admin: Tenant Management */}
                <Route path="/app/admin/tenants" element={<ProtectedRoute requireAdmin><AdminTenants /></ProtectedRoute>} />
                
                {/* Legacy Admin Routes */}
                <Route path="/admin/analytics" element={<ProtectedRoute requireAdmin><AdminAnalytics /></ProtectedRoute>} />
                <Route path="/admin/hub" element={<ProtectedRoute requireAdmin><UnifiedDashboard /></ProtectedRoute>} />
                <Route path="/admin/ceo" element={<ProtectedRoute requireAdmin><UnifiedDashboard /></ProtectedRoute>} />
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
                {/* GOVERNANCE #10: bypass-queue route REMOVED - no uncontrolled autonomy */}
                <Route path="/admin/user-settings" element={<ProtectedRoute requireAdmin><AdminUserSettings /></ProtectedRoute>} />
                <Route path="/admin/billing" element={<ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>} />
                <Route path="/admin/help" element={<ProtectedRoute requireAdmin><AdminHelp /></ProtectedRoute>} />
                <Route path="/admin/audit" element={<ProtectedRoute requireAdmin><AdminAudit /></ProtectedRoute>} />
                <Route path="/admin/approval-queue" element={<ProtectedRoute requireAdmin><AdminApprovalQueue /></ProtectedRoute>} />
                <Route path="/admin/pre-launch" element={<ProtectedRoute requireAdmin><AdminPreLaunch /></ProtectedRoute>} />
                <Route path="/admin/training" element={<ProtectedRoute requireAdmin><AdminTrainingMode /></ProtectedRoute>} />
                <Route path="/admin/prospecting" element={<ProtectedRoute requireAdmin><AdminProspecting /></ProtectedRoute>} />
                <Route path="/admin/retention" element={<ProtectedRoute requireAdmin><AdminRetention /></ProtectedRoute>} />
                <Route path="/admin/mock-mode" element={<ProtectedRoute requireAdmin><AdminMockMode /></ProtectedRoute>} />
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

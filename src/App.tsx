import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { VisitorProvider } from "@/contexts/VisitorContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRouter from "@/components/AuthRouter";
import AppLayout from "@/components/AppLayout";
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
import ClientPortal from "./pages/ClientPortal";

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
import AdminAutomation from "./pages/AdminAutomation";
import CeoDashboard from "./pages/CeoDashboard";

// Platform Admin (hidden from regular users)
import AdminTenants from "./pages/AdminTenants";
import QATests from "./pages/QATests";
import SchedulerControl from "./pages/platform/SchedulerControl";
import SchedulerDocs from "./pages/platform/SchedulerDocs";
import ProofGate from "./pages/platform/ProofGate";
import CloudWizard from "./pages/platform/CloudWizard";
import EdgeConsole from "./pages/platform/EdgeConsole";
import DbDoctor from "./pages/platform/DbDoctor";
import Access from "./pages/platform/Access";
import ToolsHub from "./pages/platform/ToolsHub";
import FeatureFlags from "./pages/platform/FeatureFlags";
import SchemaSnapshot from "./pages/platform/SchemaSnapshot";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * App routing structure:
 * 
 * AuthRouter - SINGLE routing brain that handles:
 *   - !authenticated -> /login
 *   - authenticated + !onboarding_complete -> /app/onboarding
 *   - authenticated + onboarding_complete + client -> /app/portal
 *   - authenticated + onboarding_complete + owner -> /app
 * 
 * ProtectedRoute - Access guard ONLY (no routing):
 *   - requireOwner -> redirects clients to /app/portal
 *   - requireClient -> redirects owners to /app
 *   - requireAdmin -> shows Access Denied
 * 
 * /admin/* routes redirect to /app/* (legacy support)
 * /platform/* routes are for platform admins only
 */
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
              {/* AuthRouter wraps all routes for centralized routing logic */}
              <AuthRouter>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/cookies" element={<CookiePolicy />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/login" element={<Auth />} />
                  
                  {/* Onboarding - New user flow (AuthRouter handles routing) */}
                  <Route path="/app/onboarding" element={<ProtectedRoute><OnboardingConversation /></ProtectedRoute>} />
                  
                  {/* App Routes with AppLayout */}
                  <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    {/* CEO Command Center - Primary Landing for Owners */}
                    <Route index element={<ProtectedRoute requireOwner><CEOHome /></ProtectedRoute>} />
                    
                    {/* Client Portal - Restricted view for client role */}
                    <Route path="portal" element={<ProtectedRoute requireClient><ClientPortal /></ProtectedRoute>} />
                    <Route path="portal/*" element={<ProtectedRoute requireClient><ClientPortal /></ProtectedRoute>} />
                    
                    {/* Decisions - Human approval surface */}
                    <Route path="decisions" element={<ProtectedRoute requireOwner><DecisionsDashboard /></ProtectedRoute>} />
                    
                    {/* Capability Pages - Owner only (accessed from Intelligence Grid) */}
                    <Route path="pipeline" element={<ProtectedRoute requireOwner><AdminPipeline /></ProtectedRoute>} />
                    <Route path="inbox" element={<ProtectedRoute requireOwner><AdminInbox /></ProtectedRoute>} />
                    <Route path="analytics" element={<ProtectedRoute requireOwner><AdminAnalytics /></ProtectedRoute>} />
                    <Route path="billing" element={<ProtectedRoute requireOwner><AdminBilling /></ProtectedRoute>} />
                    <Route path="content" element={<ProtectedRoute requireOwner><AdminContent /></ProtectedRoute>} />
                    <Route path="clients" element={<ProtectedRoute requireOwner><AdminClients /></ProtectedRoute>} />
                    <Route path="leads" element={<ProtectedRoute requireOwner><AdminLeads /></ProtectedRoute>} />
                    <Route path="sequences" element={<ProtectedRoute requireOwner><AdminSequences /></ProtectedRoute>} />
                    <Route path="crm" element={<ProtectedRoute requireOwner><AdminCRM /></ProtectedRoute>} />
                    <Route path="contacts" element={<ProtectedRoute requireOwner><AdminContacts /></ProtectedRoute>} />
                    <Route path="vault" element={<ProtectedRoute requireOwner><KnowledgeVault /></ProtectedRoute>} />
                    <Route path="automation" element={<ProtectedRoute requireOwner><AdminAutomation /></ProtectedRoute>} />
                    
                    {/* Settings & System - Owner only */}
                    <Route path="settings" element={<ProtectedRoute requireOwner><AdminSettings /></ProtectedRoute>} />
                    <Route path="health" element={<ProtectedRoute requireOwner><AdminSystemHealth /></ProtectedRoute>} />
                    <Route path="audit" element={<ProtectedRoute requireOwner><AdminAudit /></ProtectedRoute>} />
                    <Route path="help" element={<ProtectedRoute requireOwner><AdminHelp /></ProtectedRoute>} />
                    <Route path="business-setup" element={<ProtectedRoute requireOwner><AdminBusinessSetup /></ProtectedRoute>} />
                    <Route path="ceo-dashboard" element={<ProtectedRoute requireOwner><CeoDashboard /></ProtectedRoute>} />
                  </Route>
                  
                  {/* Platform Tools - Central hub for diagnostics */}
                  <Route path="/platform/tools" element={<ProtectedRoute><ToolsHub /></ProtectedRoute>} />
                  <Route path="/platform/proof-gate" element={<ProtectedRoute><ProofGate /></ProtectedRoute>} />
                  <Route path="/platform/access" element={<ProtectedRoute><Access /></ProtectedRoute>} />
                  <Route path="/platform/qa-tests" element={<ProtectedRoute><QATests /></ProtectedRoute>} />
                  <Route path="/platform/feature-flags" element={<ProtectedRoute><FeatureFlags /></ProtectedRoute>} />
                  <Route path="/platform/schema-snapshot" element={<ProtectedRoute><SchemaSnapshot /></ProtectedRoute>} />
                  
                  {/* Platform Tools - Owner required */}
                  <Route path="/platform/cloud-wizard" element={<ProtectedRoute requireOwner><CloudWizard /></ProtectedRoute>} />
                  <Route path="/platform/edge-console" element={<ProtectedRoute requireOwner><EdgeConsole /></ProtectedRoute>} />
                  <Route path="/platform/db-doctor" element={<ProtectedRoute requireOwner><DbDoctor /></ProtectedRoute>} />
                  
                  {/* Platform Admin - Admin only */}
                  <Route path="/platform/tenants" element={<ProtectedRoute requireAdmin><AdminTenants /></ProtectedRoute>} />
                  <Route path="/platform/scheduler" element={<ProtectedRoute requireAdmin><SchedulerControl /></ProtectedRoute>} />
                  <Route path="/platform/docs/scheduler" element={<ProtectedRoute requireAdmin><SchedulerDocs /></ProtectedRoute>} />
                  
                  {/* Legacy /admin/* redirects to /app/* */}
                  <Route path="/admin" element={<Navigate to="/app" replace />} />
                  <Route path="/admin/clients" element={<Navigate to="/app/clients" replace />} />
                  <Route path="/admin/analytics" element={<Navigate to="/app/analytics" replace />} />
                  <Route path="/admin/settings" element={<Navigate to="/app/settings" replace />} />
                  <Route path="/admin/automation" element={<Navigate to="/app/automation" replace />} />
                  <Route path="/admin/crm" element={<Navigate to="/app/crm" replace />} />
                  <Route path="/admin/leads" element={<Navigate to="/app/leads" replace />} />
                  <Route path="/admin/inbox" element={<Navigate to="/app/inbox" replace />} />
                  <Route path="/admin/pipeline" element={<Navigate to="/app/pipeline" replace />} />
                  <Route path="/admin/billing" element={<Navigate to="/app/billing" replace />} />
                  <Route path="/admin/content" element={<Navigate to="/app/content" replace />} />
                  <Route path="/admin/sequences" element={<Navigate to="/app/sequences" replace />} />
                  <Route path="/admin/contacts" element={<Navigate to="/app/contacts" replace />} />
                  <Route path="/admin/vault" element={<Navigate to="/app/vault" replace />} />
                  <Route path="/admin/health" element={<Navigate to="/app/health" replace />} />
                  <Route path="/admin/audit" element={<Navigate to="/app/audit" replace />} />
                  <Route path="/admin/help" element={<Navigate to="/app/help" replace />} />
                  <Route path="/admin/*" element={<Navigate to="/app" replace />} />
                  
                  {/* Catch all - 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthRouter>
            </BrowserRouter>
          </VisitorProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;

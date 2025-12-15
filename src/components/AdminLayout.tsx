import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Brain,
  BarChart3,
  MessageSquare,
  Users,
  Zap,
  Settings,
  FileText,
  Share2,
  Megaphone,
  Home,
  LogOut,
  ChevronLeft,
  GitBranch,
  Youtube,
  Phone,
  Mail,
  LayoutGrid,
  Target,
  Activity,
  Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const navItems = [
  { path: "/admin/ceo", label: "CEO Console", icon: Brain },
  { path: "/admin/pipeline", label: "Pipeline", icon: Target },
  { path: "/admin/accounts", label: "Accounts", icon: Building2 },
  { path: "/admin/crm", label: "CRM", icon: LayoutGrid },
  { path: "/admin/dialer", label: "Dialer", icon: Phone },
  { path: "/admin/outreach", label: "Outreach", icon: Mail },
  { path: "/admin/sms-blast", label: "SMS Blast", icon: MessageSquare },
  { path: "/admin/agent/funnels", label: "Funnels", icon: GitBranch },
  { path: "/admin/agent/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/admin/agent/inbox", label: "Inbox", icon: MessageSquare },
  { path: "/admin/leads", label: "Leads", icon: Users },
  { path: "/admin/clients", label: "Clients", icon: Users },
  { path: "/admin/onboarding", label: "Onboarding", icon: Zap },
  { path: "/admin/agent/content", label: "Content", icon: FileText },
  { path: "/admin/agent/youtube", label: "YouTube", icon: Youtube },
  { path: "/admin/agent/social", label: "Social", icon: Share2 },
  { path: "/admin/agent/ads", label: "Ads", icon: Megaphone },
  { path: "/admin/agent/sequences", label: "Sequences", icon: Zap },
  { path: "/admin/automation", label: "Automation", icon: Zap },
  { path: "/admin/system-health", label: "System Health", icon: Activity },
  { path: "/admin/settings", label: "Settings", icon: Settings },
];

const AdminLayout = ({ children, title, subtitle }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="hero-gradient text-primary-foreground">
        <div className="container py-8">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Home className="h-4 w-4 mr-2" />
              Back to Site
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
          
          <div className="flex items-center gap-4 mb-2">
            {location.pathname !== "/admin/ceo" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/ceo")}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>
              {subtitle && (
                <p className="text-primary-foreground/70 mt-1">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t border-primary-foreground/10">
          <div className="container">
            <nav className="flex gap-1 overflow-x-auto py-2 -mb-px">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    className={`
                      flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg transition-all
                      ${isActive 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
                      }
                    `}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;

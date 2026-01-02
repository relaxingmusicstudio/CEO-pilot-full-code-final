import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Phone,
  Mail,
  LayoutGrid,
  Target,
  Activity,
  Building2,
  Shield,
  UserCheck,
  Youtube,
  GitBranch,
  ChevronDown,
  DollarSign,
  Bot,
  Inbox,
  Calendar,
  Cog,
  CreditCard,
  HelpCircle,
  Search,
  ShieldAlert,
} from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: "ceo",
    label: "CEO Hub",
    icon: Brain,
    defaultOpen: true,
    items: [
      { path: "/admin/hub", label: "Command Center", icon: Bot },
      { path: "/admin/ceo", label: "Dashboard", icon: BarChart3 },
      { path: "/admin/analytics", label: "Analytics", icon: Activity },
      { path: "/admin/system-health", label: "System Health", icon: Activity },
      { path: "/admin/control-panel", label: "Control Panel", icon: Shield },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: DollarSign,
    items: [
      { path: "/admin/prospecting", label: "Prospecting", icon: Search },
      { path: "/admin/pipeline", label: "Pipeline", icon: Target },
      { path: "/admin/leads", label: "Leads", icon: Users },
      { path: "/admin/dialer", label: "Dialer", icon: Phone },
      { path: "/admin/crm", label: "CRM", icon: LayoutGrid },
      { path: "/admin/outreach", label: "Outreach", icon: Mail },
      { path: "/admin/agent/funnels", label: "Funnels", icon: GitBranch },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { path: "/admin/agent/sequences", label: "Sequences", icon: Zap },
      { path: "/admin/sms-blast", label: "SMS Blast", icon: MessageSquare },
      { path: "/admin/agent/ads", label: "Ads", icon: Megaphone },
      { path: "/admin/agent/social", label: "Social", icon: Share2 },
      { path: "/admin/agent/content", label: "Content", icon: FileText },
      { path: "/admin/agent/youtube", label: "YouTube", icon: Youtube },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: Users,
    items: [
      { path: "/admin/clients", label: "Clients", icon: Users },
      { path: "/admin/retention", label: "Retention", icon: ShieldAlert },
      { path: "/admin/billing", label: "Billing", icon: CreditCard },
      { path: "/admin/accounts", label: "Accounts", icon: Building2 },
      { path: "/admin/onboarding", label: "Onboarding", icon: Calendar },
      { path: "/admin/agent/inbox", label: "Inbox", icon: Inbox },
      { path: "/admin/bypass-queue", label: "Human Bypass", icon: UserCheck },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    icon: Zap,
    items: [
      { path: "/admin/automation", label: "Workflows", icon: Zap },
      { path: "/admin/mock-mode", label: "Mock Test Mode", icon: Activity },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    items: [
      { path: "/admin/settings", label: "Configuration", icon: Cog },
      { path: "/admin/ops", label: "Ops", icon: Shield },
      { path: "/admin/mandates", label: "Mandates", icon: ShieldAlert },
      { path: "/admin/user-settings", label: "User Settings", icon: Settings },
      { path: "/admin/help", label: "Help Center", icon: HelpCircle },
    ],
  },
];

interface GroupedNavigationProps {
  variant?: "horizontal" | "sidebar";
  className?: string;
}

export const GroupedNavigation = ({ variant = "horizontal", className = "" }: GroupedNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<string[]>(
    navGroups.filter(g => g.defaultOpen).map(g => g.id)
  );

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (group: NavGroup) => group.items.some(item => isActive(item.path));

  if (variant === "sidebar") {
    return (
      <nav className={`space-y-1 ${className}`}>
        {navGroups.map((group) => (
          <Collapsible
            key={group.id}
            open={openGroups.includes(group.id)}
            onOpenChange={() => toggleGroup(group.id)}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full justify-between ${isGroupActive(group) ? 'bg-primary/10 text-primary' : ''}`}
              >
                <span className="flex items-center gap-2">
                  {React.createElement(group.icon, { className: "h-4 w-4" })}
                  {group.label}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.includes(group.id) ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6 space-y-1 mt-1">
              {group.items.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  size="sm"
                  className={`w-full justify-start ${isActive(item.path) ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => handleNavigation(item.path)}
                >
                  {React.createElement(item.icon, { className: "h-4 w-4 mr-2" })}
                  {item.label}
                  {item.badge && (
                    <Badge variant="destructive" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    );
  }

  // Horizontal variant with shadcn DropdownMenu
  return (
    <nav className={`flex items-center gap-1 overflow-visible ${className}`}>
      {navGroups.map((group) => (
        <DropdownMenu key={group.id}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`
                flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-lg transition-all
                ${isGroupActive(group) 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
                }
              `}
            >
              {React.createElement(group.icon, { className: "h-4 w-4" })}
              <span className="hidden md:inline">{group.label}</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48 bg-popover">
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`cursor-pointer ${isActive(item.path) ? 'bg-accent' : ''}`}
              >
                {React.createElement(item.icon, { className: "h-4 w-4 mr-2" })}
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
};

export default GroupedNavigation;

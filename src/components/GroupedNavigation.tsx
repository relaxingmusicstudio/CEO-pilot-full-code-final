import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: any;
  badge?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: any;
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
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    items: [
      { path: "/admin/settings", label: "Configuration", icon: Cog },
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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleDropdown = (groupId: string) => {
    setOpenDropdown(prev => prev === groupId ? null : groupId);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setOpenDropdown(null);
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
                  <group.icon className="h-4 w-4" />
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
                  <item.icon className="h-4 w-4 mr-2" />
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

  // Horizontal variant with click-based dropdowns
  return (
    <nav ref={dropdownRef} className={`flex items-center gap-1 overflow-x-auto ${className}`}>
      {navGroups.map((group) => (
        <div key={group.id} className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleDropdown(group.id)}
            className={`
              flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-lg transition-all
              ${isGroupActive(group) 
                ? "bg-primary-foreground/20 text-primary-foreground" 
                : "text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
              }
            `}
          >
            <group.icon className="h-4 w-4" />
            <span className="hidden md:inline">{group.label}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${openDropdown === group.id ? 'rotate-180' : ''}`} />
          </Button>
          
          {/* Dropdown - click triggered */}
          {openDropdown === group.id && (
            <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-[100] min-w-48">
              <div className="p-1">
                {group.items.map((item) => (
                  <Button
                    key={item.path}
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start ${isActive(item.path) ? 'bg-accent' : ''}`}
                    onClick={() => handleNavigation(item.path)}
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
};

export default GroupedNavigation;

/**
 * Hook for role-based navigation items
 * 
 * Returns navigation items based on user role:
 * - Owner: Full CEO Command Center nav (Pipeline, Content, Automation, etc.)
 * - Client: Limited portal nav (Messages, Deliverables, Billing, etc.)
 * 
 * TEST CHECKLIST:
 * - Owner sees full nav items
 * - Client sees ONLY portal nav items
 * - Client NEVER sees automation/system links
 */

import { useMemo } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard,
  Target,
  MessageSquare,
  TrendingUp,
  DollarSign,
  FileText,
  CheckCircle2,
  Settings,
  Users,
  Calendar,
  HelpCircle,
  Bell,
  ShieldCheck,
  Building2,
  Wrench,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

// Owner navigation - Full CEO Command Center
export const OWNER_NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app",
    icon: LayoutDashboard,
    description: "CEO Command Center",
  },
  {
    label: "Pipeline",
    href: "/app/pipeline",
    icon: Target,
    description: "Leads & opportunities",
  },
  {
    label: "Inbox",
    href: "/app/inbox",
    icon: MessageSquare,
    description: "Communications",
  },
  {
    label: "Analytics",
    href: "/app/analytics",
    icon: TrendingUp,
    description: "Growth metrics",
  },
  {
    label: "Billing",
    href: "/app/billing",
    icon: DollarSign,
    description: "Finance & invoices",
  },
  {
    label: "Content",
    href: "/app/content",
    icon: FileText,
    description: "Content studio",
  },
  {
    label: "Decisions",
    href: "/app/decisions",
    icon: CheckCircle2,
    description: "Pending approvals",
  },
  {
    label: "Clients",
    href: "/app/clients",
    icon: Users,
    description: "Client management",
  },
  {
    label: "Settings",
    href: "/app/settings",
    icon: Settings,
    description: "System settings",
  },
];

// Client navigation - Limited portal access
export const CLIENT_NAV_ITEMS: NavItem[] = [
  {
    label: "Portal",
    href: "/app/portal",
    icon: LayoutDashboard,
    description: "Your dashboard",
  },
  {
    label: "Messages",
    href: "/app/portal/messages",
    icon: MessageSquare,
    description: "Communications",
  },
  {
    label: "Deliverables",
    href: "/app/portal/deliverables",
    icon: FileText,
    description: "Your reports & files",
  },
  {
    label: "Billing",
    href: "/app/portal/billing",
    icon: DollarSign,
    description: "Invoices & payments",
  },
  {
    label: "Requests",
    href: "/app/portal/requests",
    icon: Bell,
    description: "Submit requests",
  },
  {
    label: "Meetings",
    href: "/app/portal/meetings",
    icon: Calendar,
    description: "Schedule & history",
  },
  {
    label: "Help",
    href: "/app/portal/help",
    icon: HelpCircle,
    description: "Support & FAQ",
  },
];

// Mobile nav - 5 most important items per role
const OWNER_MOBILE_NAV = OWNER_NAV_ITEMS.slice(0, 5);
const CLIENT_MOBILE_NAV = CLIENT_NAV_ITEMS.slice(0, 5);

// Platform Tools - Available to all authenticated users
export const PLATFORM_NAV_ITEM: NavItem = {
  label: "Platform Tools",
  href: "/platform/tools",
  icon: Wrench,
  description: "Diagnostics & dev tools",
};

// Admin-only navigation items (platform admins)
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: "Tenants",
    href: "/platform/tenants",
    icon: Building2,
    description: "Manage tenants",
  },
  {
    label: "QA Tests",
    href: "/platform/qa-tests",
    icon: ShieldCheck,
    description: "Tenant isolation tests",
  },
];

/**
 * Pure function to get nav items for a role context.
 * Used by RouteNavAuditor to check nav visibility.
 */
export function getNavItemsForRole(context: {
  isAdmin: boolean;
  isOwner: boolean;
  isClient: boolean;
}): NavItem[] {
  if (context.isClient) return CLIENT_NAV_ITEMS;
  if (context.isOwner) {
    if (context.isAdmin) {
      return [...OWNER_NAV_ITEMS, PLATFORM_NAV_ITEM, ...ADMIN_NAV_ITEMS];
    }
    return [...OWNER_NAV_ITEMS, PLATFORM_NAV_ITEM];
  }
  return [];
}

/**
 * Get all nav routes for a role context.
 */
export function getNavRoutesForRole(context: {
  isAdmin: boolean;
  isOwner: boolean;
  isClient: boolean;
}): string[] {
  return getNavItemsForRole(context).map(item => item.href);
}

export function useRoleNavigation() {
  const { isOwner, isClient, isAdmin, isLoading } = useUserRole();

  const navItems = useMemo(() => {
    if (isLoading) return [];
    if (isClient) return CLIENT_NAV_ITEMS;
    if (isOwner) {
      // Admin gets owner nav + admin-only items + platform tools
      if (isAdmin) {
        return [...OWNER_NAV_ITEMS, PLATFORM_NAV_ITEM, ...ADMIN_NAV_ITEMS];
      }
      // Owner gets nav + platform tools
      return [...OWNER_NAV_ITEMS, PLATFORM_NAV_ITEM];
    }
    return [];
  }, [isOwner, isClient, isAdmin, isLoading]);

  const mobileNavItems = useMemo(() => {
    if (isLoading) return [];
    if (isClient) return CLIENT_MOBILE_NAV;
    if (isOwner) return OWNER_MOBILE_NAV;
    return [];
  }, [isOwner, isClient, isLoading]);

  const homeRoute = useMemo(() => {
    if (isClient) return "/app/portal";
    return "/app";
  }, [isClient]);

  return {
    navItems,
    mobileNavItems,
    homeRoute,
    isOwner,
    isClient,
    isAdmin,
    isLoading,
  };
}

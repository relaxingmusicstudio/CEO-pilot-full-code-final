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
  ADMIN_NAV_ITEMS_BASE,
  CLIENT_NAV_ITEMS_BASE,
  OWNER_NAV_ITEMS_BASE,
  PLATFORM_NAV_ITEM_BASE,
  getNavRoutesForRole,
  type NavItemBase,
} from "@/lib/navigationData";
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
  ClipboardCheck,
  ListChecks,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

export { getNavRoutesForRole };

const NAV_ICON_MAP: Record<string, NavItem["icon"]> = {
  "/app": LayoutDashboard,
  "/app/pipeline": Target,
  "/app/inbox": MessageSquare,
  "/app/analytics": TrendingUp,
  "/app/billing": DollarSign,
  "/app/content": FileText,
  "/app/integrations": ShieldCheck,
  "/app/ops": ClipboardCheck,
  "/app/setup": ListChecks,
  "/app/llm-smoke": Wrench,
  "/app/pipelines/plastic-surgeon": Target,
  "/app/decisions": CheckCircle2,
  "/app/clients": Users,
  "/app/settings": Settings,
  "/app/portal": LayoutDashboard,
  "/app/portal/messages": MessageSquare,
  "/app/portal/deliverables": FileText,
  "/app/portal/billing": DollarSign,
  "/app/portal/requests": Bell,
  "/app/portal/meetings": Calendar,
  "/app/portal/help": HelpCircle,
  "/platform/tools": Wrench,
  "/platform/tenants": Building2,
  "/platform/qa-tests": ShieldCheck,
};

const attachIcons = (items: NavItemBase[]): NavItem[] =>
  items.map((item) => ({
    ...item,
    icon: NAV_ICON_MAP[item.href],
  }));

// Owner navigation - Full CEO Command Center
export const OWNER_NAV_ITEMS = attachIcons(OWNER_NAV_ITEMS_BASE);

// Client navigation - Limited portal access
export const CLIENT_NAV_ITEMS = attachIcons(CLIENT_NAV_ITEMS_BASE);

// Platform Tools - Available to all authenticated users
export const PLATFORM_NAV_ITEM: NavItem = {
  ...PLATFORM_NAV_ITEM_BASE,
  icon: NAV_ICON_MAP[PLATFORM_NAV_ITEM_BASE.href],
};

// Admin-only navigation items (platform admins)
export const ADMIN_NAV_ITEMS = attachIcons(ADMIN_NAV_ITEMS_BASE);

// Mobile nav - 5 most important items per role
const OWNER_MOBILE_NAV = OWNER_NAV_ITEMS.slice(0, 5);
const CLIENT_MOBILE_NAV = CLIENT_NAV_ITEMS.slice(0, 5);

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

export type NavItemBase = {
  label: string;
  href: string;
  description?: string;
};

// Owner navigation - Full CEO Command Center
export const OWNER_NAV_ITEMS_BASE: NavItemBase[] = [
  {
    label: "Dashboard",
    href: "/app",
    description: "CEO Command Center",
  },
  {
    label: "Pipeline",
    href: "/app/pipeline",
    description: "Leads & opportunities",
  },
  {
    label: "Inbox",
    href: "/app/inbox",
    description: "Communications",
  },
  {
    label: "Analytics",
    href: "/app/analytics",
    description: "Growth metrics",
  },
  {
    label: "Billing",
    href: "/app/billing",
    description: "Finance & invoices",
  },
  {
    label: "Content",
    href: "/app/content",
    description: "Content studio",
  },
  {
    label: "Integrations",
    href: "/app/integrations",
    description: "Provider keys & connectivity",
  },
  {
    label: "Ops Hub",
    href: "/app/ops",
    description: "Proof gate & runbooks",
  },
  {
    label: "Setup Wizard",
    href: "/app/setup",
    description: "Guided env + gateway setup",
  },
  {
    label: "LLM Smoke",
    href: "/app/llm-smoke",
    description: "Safe live test surface",
  },
  {
    label: "Plastic Surgeon",
    href: "/app/pipelines/plastic-surgeon",
    description: "Lead engine",
  },
  {
    label: "Decisions",
    href: "/app/decisions",
    description: "Pending approvals",
  },
  {
    label: "Control Room",
    href: "/app/control-room",
    description: "Governance oversight",
  },
  {
    label: "Clients",
    href: "/app/clients",
    description: "Client management",
  },
  {
    label: "Settings",
    href: "/app/settings",
    description: "System settings",
  },
];

// Client navigation - Limited portal access
export const CLIENT_NAV_ITEMS_BASE: NavItemBase[] = [
  {
    label: "Portal",
    href: "/app/portal",
    description: "Your dashboard",
  },
  {
    label: "Messages",
    href: "/app/portal/messages",
    description: "Communications",
  },
  {
    label: "Deliverables",
    href: "/app/portal/deliverables",
    description: "Your reports & files",
  },
  {
    label: "Billing",
    href: "/app/portal/billing",
    description: "Invoices & payments",
  },
  {
    label: "Requests",
    href: "/app/portal/requests",
    description: "Submit requests",
  },
  {
    label: "Meetings",
    href: "/app/portal/meetings",
    description: "Schedule & history",
  },
  {
    label: "Help",
    href: "/app/portal/help",
    description: "Support & FAQ",
  },
];

// Platform Tools - Available to all authenticated users
export const PLATFORM_NAV_ITEM_BASE: NavItemBase = {
  label: "Platform Tools",
  href: "/platform/tools",
  description: "Diagnostics & dev tools",
};

// Admin-only navigation items (platform admins)
export const ADMIN_NAV_ITEMS_BASE: NavItemBase[] = [
  {
    label: "Tenants",
    href: "/platform/tenants",
    description: "Manage tenants",
  },
  {
    label: "QA Tests",
    href: "/platform/qa-tests",
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
}): NavItemBase[] {
  if (context.isClient) return CLIENT_NAV_ITEMS_BASE;
  if (context.isOwner) {
    if (context.isAdmin) {
      return [...OWNER_NAV_ITEMS_BASE, PLATFORM_NAV_ITEM_BASE, ...ADMIN_NAV_ITEMS_BASE];
    }
    return [...OWNER_NAV_ITEMS_BASE, PLATFORM_NAV_ITEM_BASE];
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

import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback } from "react";

export type EntityType = "leads" | "pipeline" | "content" | "sequences" | "clients" | "approvals" | "vault" | "crm" | "system-health" | "settings";

interface NavigationOptions {
  filter?: string;
  status?: string;
  id?: string;
  date?: string;
  tab?: string;
  [key: string]: string | undefined;
}

interface ClickThroughReturn {
  navigateToDetail: (entity: EntityType, options?: NavigationOptions) => void;
  navigateToCEO: () => void;
  navigateToCommandCenter: (section?: string) => void;
  buildDetailUrl: (entity: EntityType, options?: NavigationOptions) => string;
  getQueryParams: () => Record<string, string>;
}

const ENTITY_ROUTES: Record<EntityType, string> = {
  leads: "/app/command-center/crm",
  pipeline: "/app/command-center/pipeline",
  content: "/app/command-center/content",
  sequences: "/app/command-center/sequences",
  clients: "/app/command-center/clients",
  approvals: "/app/command-center/approvals",
  vault: "/app/command-center/vault",
  crm: "/app/command-center/crm",
  "system-health": "/app/command-center/system-health",
  settings: "/app/command-center/settings",
};

export function useClickThrough(): ClickThroughReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const buildDetailUrl = useCallback((entity: EntityType, options?: NavigationOptions): string => {
    const basePath = ENTITY_ROUTES[entity];
    if (!options || Object.keys(options).length === 0) {
      return basePath;
    }

    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value);
      }
    });

    return `${basePath}?${params.toString()}`;
  }, []);

  const navigateToDetail = useCallback((entity: EntityType, options?: NavigationOptions) => {
    const url = buildDetailUrl(entity, options);
    navigate(url);
  }, [navigate, buildDetailUrl]);

  const navigateToCEO = useCallback(() => {
    navigate("/app/ceo");
  }, [navigate]);

  const navigateToCommandCenter = useCallback((section?: string) => {
    if (section) {
      navigate(`/app/command-center/${section}`);
    } else {
      navigate("/app/command-center");
    }
  }, [navigate]);

  const getQueryParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }, [searchParams]);

  return {
    navigateToDetail,
    navigateToCEO,
    navigateToCommandCenter,
    buildDetailUrl,
    getQueryParams,
  };
}

export default useClickThrough;

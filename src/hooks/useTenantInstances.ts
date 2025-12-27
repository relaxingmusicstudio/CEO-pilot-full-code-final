import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useTenant } from "./useTenant";

export type InstanceStatus = "provisioning" | "active" | "failed";
export type InstanceType = "web" | "admin";

export interface TenantInstance {
  id: string;
  tenant_id: string;
  instance_type: InstanceType;
  subdomain: string;
  domain: string | null;
  custom_domain: string | null;
  domain_verified_at: string | null;
  ssl_status: string;
  status: InstanceStatus;
  config: Record<string, unknown>;
  created_at: string;
  activated_at: string | null;
}

export const useTenantInstances = () => {
  const { tenant } = useTenant();
  const [instances, setInstances] = useState<TenantInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInstances = async () => {
      if (!tenant?.id) {
        setInstances([]);
        setIsLoading(false);
        return;
      }

      try {
        // Use raw query since types may not be synced yet
        const tenantInstancesTable =
          "tenant_instances" as unknown as keyof Database["public"]["Tables"];
        const { data, error } = await supabase
          .from(tenantInstancesTable)
          .select("*")
          .eq("tenant_id", tenant.id);

        if (error) throw error;
        setInstances((data as unknown as TenantInstance[]) || []);
      } catch (error) {
        console.error("Error fetching tenant instances:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInstances();
  }, [tenant?.id]);

  const webInstance = instances.find((i) => i.instance_type === "web");
  const adminInstance = instances.find((i) => i.instance_type === "admin");

  const getPublicUrl = () => {
    if (!webInstance) return null;
    if (webInstance.custom_domain && webInstance.domain_verified_at) {
      return `https://${webInstance.custom_domain}`;
    }
    return `https://${webInstance.subdomain}.lovable.app`;
  };

  const getAdminUrl = () => {
    if (!adminInstance) return null;
    return `https://${adminInstance.subdomain}.lovable.app`;
  };

  return {
    instances,
    webInstance,
    adminInstance,
    isLoading,
    getPublicUrl,
    getAdminUrl,
    isProvisioning: instances.some((i) => i.status === "provisioning"),
    isActive: instances.every((i) => i.status === "active") && instances.length > 0,
  };
};

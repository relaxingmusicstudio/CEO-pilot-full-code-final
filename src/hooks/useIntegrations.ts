import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Service {
  service_key: string;
  display_name: string;
  category: string;
  icon_emoji: string;
  description: string;
  auth_method: string;
  is_connected: boolean;
  connection_status: string | null;
  last_health_check: string | null;
  setup_instructions: SetupInstruction[];
  credential_fields: CredentialField[];
  documentation_url: string;
}

interface CredentialField {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}

interface SetupInstruction {
  step: string | number;
  description: string;
}

interface Suggestion {
  service_key: string;
  display_name: string;
  category: string;
  icon_emoji: string;
  description: string;
  relationship_type: string;
  priority: number;
  reason: string;
  source_service: string;
}

interface IntegrationTemplate {
  template_key: string;
  display_name: string;
  description: string;
  icon_emoji: string;
  recommended_services: string[];
  required_services: string[];
  setup_order: string[];
}

interface CredentialRecord {
  service_key: string;
  connection_status?: string | null;
  display_name?: string;
  icon_emoji?: string;
  category?: string;
  credential_type?: string;
  last_tested_at?: string | null;
  expires_at?: string | null;
  [key: string]: unknown;
}

export function useIntegrations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // List all services with their connection status
  const listServices = useCallback(async (category?: string): Promise<Service[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('service-registry', {
        body: { action: 'list', category, include_connected: true },
      });
      
      if (fnError) throw fnError;
      return data?.services || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list services';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get details for a specific service
  const getService = useCallback(async (serviceKey: string): Promise<Service | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('service-registry', {
        body: { action: 'get', service_key: serviceKey },
      });
      
      if (fnError) throw fnError;
      return data?.service || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get service';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get smart suggestions based on current connections
  const getSuggestions = useCallback(async (businessType?: string): Promise<Suggestion[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('service-registry', {
        body: { action: 'suggest', business_type: businessType },
      });
      
      if (fnError) throw fnError;
      return data?.suggestions || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get suggestions';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get integration templates
  const getTemplates = useCallback(async (): Promise<IntegrationTemplate[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('service-registry', {
        body: { action: 'templates' },
      });
      
      if (fnError) throw fnError;
      return data?.templates || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get templates';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Store a credential
  const storeCredential = useCallback(async (
    serviceKey: string,
    credentialData: Record<string, unknown>,
    agentName: string = 'user'
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('credential-vault', {
        body: {
          action: 'store',
          service_key: serviceKey,
          agent_name: agentName,
          credential_data: credentialData,
        },
      });
      
      if (fnError) throw fnError;
      return data?.success || false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to store credential';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Test a credential
  const testCredential = useCallback(async (
    serviceKey: string,
    agentName: string = 'user'
  ): Promise<{ success: boolean; status: string; message: string }> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('credential-vault', {
        body: {
          action: 'test',
          service_key: serviceKey,
          agent_name: agentName,
        },
      });
      
      if (fnError) throw fnError;
      return {
        success: data?.success || false,
        status: data?.status || 'unknown',
        message: data?.message || 'Unknown result',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test credential';
      setError(message);
      return { success: false, status: 'error', message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // List all connected credentials
  const listCredentials = useCallback(async (): Promise<CredentialRecord[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('credential-vault', {
        body: { action: 'list' },
      });
      
      if (fnError) throw fnError;
      return (data?.credentials || []) as CredentialRecord[];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list credentials';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a credential
  const deleteCredential = useCallback(async (
    serviceKey: string,
    agentName: string = 'user'
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('credential-vault', {
        body: {
          action: 'delete',
          service_key: serviceKey,
          agent_name: agentName,
        },
      });
      
      if (fnError) throw fnError;
      return data?.success || false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete credential';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get integration status summary
  const getIntegrationStatus = useCallback(async () => {
    try {
      const [services, credentials] = await Promise.all([
        listServices(),
        listCredentials(),
      ]);
      
      const credentialMap = new Map(credentials.map((c) => [c.service_key, c]));
      
      const connected = credentials.length;
      const healthy = credentials.filter((c) => c.connection_status === 'healthy').length;
      const degraded = credentials.filter((c) => c.connection_status === 'degraded').length;
      const expired = credentials.filter((c) => c.connection_status === 'expired').length;
      
      return {
        total_available: services.length,
        connected,
        healthy,
        degraded,
        expired,
        by_category: services.reduce((acc: Record<string, { total: number; connected: number }>, svc: Service) => {
          const cat = svc.category;
          if (!acc[cat]) acc[cat] = { total: 0, connected: 0 };
          acc[cat].total++;
          if (credentialMap.has(svc.service_key)) acc[cat].connected++;
          return acc;
        }, {}),
      };
    } catch (err) {
      console.error('Failed to get integration status:', err);
      return null;
    }
  }, [listServices, listCredentials]);

  return {
    isLoading,
    error,
    listServices,
    getService,
    getSuggestions,
    getTemplates,
    storeCredential,
    testCredential,
    listCredentials,
    deleteCredential,
    getIntegrationStatus,
  };
}

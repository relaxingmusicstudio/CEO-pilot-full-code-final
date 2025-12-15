import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RealtimeAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'urgent';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export const useRealtimeAlerts = () => {
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Subscribe to real-time work_queue changes
    const workQueueChannel = supabase
      .channel('realtime-work-queue')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_queue',
        },
        (payload) => {
          const newItem = payload.new as any;
          
          // Create alert from work queue item
          const alert: RealtimeAlert = {
            id: newItem.id,
            type: newItem.type || 'task',
            title: newItem.title,
            message: newItem.description,
            priority: newItem.priority || 'normal',
            timestamp: new Date(newItem.created_at),
            metadata: newItem.metadata,
          };

          setAlerts(prev => [alert, ...prev.slice(0, 49)]);
          setUnreadCount(prev => prev + 1);

          // Show toast for urgent items
          if (newItem.priority === 'urgent') {
            toast.error(newItem.title, {
              description: newItem.description?.slice(0, 100),
              duration: 10000,
              action: {
                label: 'View',
                onClick: () => window.location.href = '/admin/approval-queue',
              },
            });
          } else if (newItem.type === 'alert') {
            toast.warning(newItem.title, {
              description: newItem.description?.slice(0, 100),
              duration: 5000,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Work queue subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Subscribe to real-time CEO alerts
    const alertsChannel = supabase
      .channel('realtime-ceo-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ceo_alerts',
        },
        (payload) => {
          const newAlert = payload.new as any;
          
          const alert: RealtimeAlert = {
            id: newAlert.id,
            type: newAlert.alert_type,
            title: newAlert.title,
            message: newAlert.message || '',
            priority: newAlert.priority || 'normal',
            timestamp: new Date(newAlert.created_at),
            metadata: newAlert.metadata,
          };

          setAlerts(prev => [alert, ...prev.slice(0, 49)]);
          setUnreadCount(prev => prev + 1);

          // Critical alerts get special treatment
          if (newAlert.priority === 'urgent' || newAlert.alert_type === 'churn_critical') {
            toast.error(`🚨 ${newAlert.title}`, {
              description: newAlert.message?.slice(0, 150),
              duration: 15000,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to lead temperature changes
    const leadsChannel = supabase
      .channel('realtime-leads')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          const newLead = payload.new as any;
          const oldLead = payload.old as any;

          // Alert when lead becomes hot
          if (newLead.lead_temperature === 'hot' && oldLead.lead_temperature !== 'hot') {
            const alert: RealtimeAlert = {
              id: `lead-hot-${newLead.id}`,
              type: 'lead_hot',
              title: `🔥 Lead went HOT: ${newLead.name || newLead.business_name}`,
              message: `Score: ${newLead.lead_score}. Source: ${newLead.source || 'unknown'}`,
              priority: 'urgent',
              timestamp: new Date(),
              metadata: { leadId: newLead.id, score: newLead.lead_score },
            };

            setAlerts(prev => [alert, ...prev.slice(0, 49)]);
            setUnreadCount(prev => prev + 1);

            toast.success(`🔥 HOT LEAD: ${newLead.name || newLead.business_name}`, {
              description: `Score jumped to ${newLead.lead_score}!`,
              duration: 8000,
              action: {
                label: 'View',
                onClick: () => window.location.href = '/admin/leads',
              },
            });
          }
        }
      )
      .subscribe();

    // Subscribe to client health changes
    const clientsChannel = supabase
      .channel('realtime-clients')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clients',
        },
        (payload) => {
          const newClient = payload.new as any;
          const oldClient = payload.old as any;

          // Alert when health drops significantly
          const oldHealth = oldClient.health_score || 100;
          const newHealth = newClient.health_score || 100;
          
          if (newHealth < 50 && oldHealth >= 50) {
            const alert: RealtimeAlert = {
              id: `client-health-${newClient.id}`,
              type: 'client_at_risk',
              title: `⚠️ Client at risk: ${newClient.business_name || newClient.name}`,
              message: `Health dropped from ${oldHealth} to ${newHealth}. MRR: $${newClient.mrr}`,
              priority: 'urgent',
              timestamp: new Date(),
              metadata: { clientId: newClient.id, mrr: newClient.mrr },
            };

            setAlerts(prev => [alert, ...prev.slice(0, 49)]);
            setUnreadCount(prev => prev + 1);

            toast.warning(`⚠️ Client health dropped: ${newClient.business_name}`, {
              description: `Health: ${newHealth}. MRR at risk: $${newClient.mrr}`,
              duration: 10000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(workQueueChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(clientsChannel);
    };
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadCount(0);
  }, []);

  return {
    alerts,
    isConnected,
    unreadCount,
    markAllRead,
    clearAlerts,
  };
};
